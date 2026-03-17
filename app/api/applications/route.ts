import { NextRequest, NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";
import { v4 as uuidv4 } from "uuid";

const ADMIN_WALLET = "DDSpvAK8DbuAdEaaBHkfLieLPSJVCWWgquFAA3pvxXoX";
const ADMIN_SECRET = process.env.ADMIN_SECRET;
const APPLICATIONS_FILE = path.join(process.cwd(), "data", "applications.json");
const ALLOWLIST_FILE = path.join(process.cwd(), "data", "allowlist.json");

interface Application {
  id: string;
  walletAddress: string;
  collectionName: string;
  collectionAddress: string;
  category: string;
  description: string;
  pitch: string;
  sampleImages: string[];
  website?: string;
  twitter?: string;
  status: "pending" | "approved" | "rejected";
  submittedAt: number;
  reviewedAt: null | number;
  reviewedBy: null | string;
  rejectionReason: null | string;
}

interface ApplicationsData {
  applications: Application[];
}

interface AllowlistEntry {
  mintAuthority: string;
  name: string;
  category: string;
  addedAt: number;
  addedBy: string;
  verified: boolean;
}

interface AllowlistData {
  collections: AllowlistEntry[];
}

async function readApplications(): Promise<ApplicationsData> {
  try {
    const content = await fs.readFile(APPLICATIONS_FILE, "utf-8");
    return JSON.parse(content);
  } catch {
    return { applications: [] };
  }
}

async function writeApplications(data: ApplicationsData): Promise<void> {
  await fs.writeFile(APPLICATIONS_FILE, JSON.stringify(data, null, 2), "utf-8");
}

async function readAllowlist(): Promise<AllowlistData> {
  try {
    const content = await fs.readFile(ALLOWLIST_FILE, "utf-8");
    return JSON.parse(content);
  } catch {
    return { collections: [] };
  }
}

async function writeAllowlist(data: AllowlistData): Promise<void> {
  await fs.writeFile(ALLOWLIST_FILE, JSON.stringify(data, null, 2), "utf-8");
}

function validateAdmin(adminWallet: string, secret?: string): boolean {
  if (!ADMIN_SECRET) return false;
  return adminWallet === ADMIN_WALLET && secret === ADMIN_SECRET;
}

/**
 * GET /api/applications
 * List applications. If admin=true in query, show all. Otherwise show only user's own.
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const admin = searchParams.get("admin") === "true";
    const walletAddress = searchParams.get("wallet");

    const data = await readApplications();

    if (admin) {
      // Admin can see all applications
      return NextResponse.json({
        success: true,
        applications: data.applications,
      });
    }

    // Non-admin users only see their own applications
    if (!walletAddress) {
      return NextResponse.json(
        { error: "Wallet address required for non-admin requests" },
        { status: 400 }
      );
    }

    const userApplications = data.applications.filter(
      (app) => app.walletAddress === walletAddress
    );

    return NextResponse.json({
      success: true,
      applications: userApplications,
    });
  } catch (error) {
    console.error("Failed to fetch applications:", error);
    return NextResponse.json(
      { error: "Failed to fetch applications" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/applications
 * Submit a new application
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      walletAddress,
      collectionName,
      collectionAddress,
      category,
      description,
      pitch,
      sampleImages,
      website,
      twitter,
    } = body;

    // Validate required fields
    if (
      !walletAddress ||
      !collectionName ||
      !collectionAddress ||
      !category ||
      !description ||
      !pitch
    ) {
      return NextResponse.json(
        {
          error:
            "Missing required fields: walletAddress, collectionName, collectionAddress, category, description, pitch",
        },
        { status: 400 }
      );
    }

    // Validate field lengths
    if (description.length > 500) {
      return NextResponse.json(
        { error: "Description must be 500 characters or less" },
        { status: 400 }
      );
    }

    if (pitch.length > 300) {
      return NextResponse.json(
        { error: "Pitch must be 300 characters or less" },
        { status: 400 }
      );
    }

    if (sampleImages && sampleImages.length > 3) {
      return NextResponse.json(
        { error: "Maximum 3 sample images allowed" },
        { status: 400 }
      );
    }

    const data = await readApplications();

    const newApplication: Application = {
      id: uuidv4(),
      walletAddress,
      collectionName,
      collectionAddress,
      category,
      description,
      pitch,
      sampleImages: sampleImages || [],
      website: website || undefined,
      twitter: twitter || undefined,
      status: "pending",
      submittedAt: Date.now(),
      reviewedAt: null,
      reviewedBy: null,
      rejectionReason: null,
    };

    data.applications.push(newApplication);
    await writeApplications(data);

    return NextResponse.json(
      {
        success: true,
        application: newApplication,
      },
      { status: 201 }
    );
  } catch (error: any) {
    console.error("Failed to submit application:", error);
    return NextResponse.json(
      { error: error.message || "Failed to submit application" },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/applications
 * Approve or reject an application (admin only)
 */
export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json();
    const { id, action, rejectionReason, adminWallet, adminSecret } = body;

    if (!validateAdmin(adminWallet, adminSecret)) {
      return NextResponse.json(
        { error: "Unauthorized: Invalid admin wallet" },
        { status: 403 }
      );
    }

    if (!id || !action || (action !== "approve" && action !== "reject")) {
      return NextResponse.json(
        {
          error:
            'Missing or invalid fields: id, action (must be "approve" or "reject")',
        },
        { status: 400 }
      );
    }

    if (action === "reject" && !rejectionReason) {
      return NextResponse.json(
        { error: "Rejection reason is required when rejecting" },
        { status: 400 }
      );
    }

    const data = await readApplications();
    const applicationIndex = data.applications.findIndex((app) => app.id === id);

    if (applicationIndex === -1) {
      return NextResponse.json(
        { error: "Application not found" },
        { status: 404 }
      );
    }

    const application = data.applications[applicationIndex];

    if (action === "approve") {
      application.status = "approved";
      application.reviewedAt = Date.now();
      application.reviewedBy = adminWallet;

      // Add to allowlist
      const allowlist = await readAllowlist();
      const alreadyInAllowlist = allowlist.collections.some(
        (c) => c.mintAuthority === application.collectionAddress
      );

      if (!alreadyInAllowlist) {
        allowlist.collections.push({
          mintAuthority: application.collectionAddress,
          name: application.collectionName,
          category: application.category,
          addedAt: Date.now(),
          addedBy: adminWallet,
          verified: true,
        });
        await writeAllowlist(allowlist);
      }
    } else if (action === "reject") {
      application.status = "rejected";
      application.reviewedAt = Date.now();
      application.reviewedBy = adminWallet;
      application.rejectionReason = rejectionReason;
    }

    await writeApplications(data);

    return NextResponse.json({
      success: true,
      application,
    });
  } catch (error: any) {
    console.error("Failed to update application:", error);
    return NextResponse.json(
      { error: error.message || "Failed to update application" },
      { status: 500 }
    );
  }
}
