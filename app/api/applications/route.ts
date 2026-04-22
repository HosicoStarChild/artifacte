import { NextRequest, NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";

import type { AllowlistEntry } from "@/lib/allowlist";
import { matchesAllowlistIdentifier } from "@/lib/allowlist";
import {
  normalizeApplicationSampleImages,
  normalizeApplicationText,
  normalizeOptionalApplicationUrl,
  normalizeTwitterHandle,
  type Application,
  type ApplicationsData,
  type CreateApplicationRequest,
  type ReviewApplicationRequest,
  isApplicationReviewAction,
  validateApplicationFields,
} from "@/lib/applications";
import {
  assertSignedAdminRequest,
  readSignedAdminJson,
  toAdminRequestErrorResponse,
} from "@/lib/server/admin-request";

const APPLICATIONS_FILE = path.join(process.cwd(), "data", "applications.json");
const ALLOWLIST_FILE = path.join(process.cwd(), "data", "allowlist.json");

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

/**
 * GET /api/applications
 * List applications. Admin reads require a signed wallet. Otherwise show only user's own.
 */
export async function GET(req: NextRequest) {
  try {
    const data = await readApplications();
    const walletAddress = req.nextUrl.searchParams.get("wallet")?.trim() ?? "";

    if (walletAddress) {
      const userApplications = data.applications.filter(
        (application) => application.walletAddress === walletAddress
      );

      return NextResponse.json({
        success: true,
        applications: userApplications,
      });
    }

    await assertSignedAdminRequest(req, "access");

    return NextResponse.json({
      success: true,
      applications: data.applications,
    });
  } catch (error) {
    return toAdminRequestErrorResponse(
      error instanceof Error ? error : new Error("Failed to fetch applications"),
      "Failed to fetch applications"
    );
  }
}

/**
 * POST /api/applications
 * Submit a new application
 */
export async function POST(req: NextRequest) {
  let body: CreateApplicationRequest;

  try {
    body = (await req.json()) as CreateApplicationRequest;
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  try {
    const walletAddress =
      typeof body.walletAddress === "string" ? normalizeApplicationText(body.walletAddress) : "";
    const collectionName =
      typeof body.collectionName === "string"
        ? normalizeApplicationText(body.collectionName)
        : "";
    const collectionAddress =
      typeof body.collectionAddress === "string"
        ? normalizeApplicationText(body.collectionAddress)
        : "";
    const category =
      typeof body.category === "string" ? normalizeApplicationText(body.category) : "";
    const description =
      typeof body.description === "string"
        ? normalizeApplicationText(body.description)
        : "";
    const pitch =
      typeof body.pitch === "string" ? normalizeApplicationText(body.pitch) : "";
    const sampleImages = Array.isArray(body.sampleImages)
      ? normalizeApplicationSampleImages(
          body.sampleImages.filter((sampleImage) => typeof sampleImage === "string")
        )
      : [];
    const website =
      typeof body.website === "string" ? normalizeOptionalApplicationUrl(body.website) : undefined;
    const twitter =
      typeof body.twitter === "string" ? normalizeTwitterHandle(body.twitter) : undefined;

    const validationMessage = validateApplicationFields({
      walletAddress,
      collectionName,
      collectionAddress,
      category,
      description,
      pitch,
      sampleImages,
      website,
      twitter,
    });

    if (validationMessage) {
      return NextResponse.json({ error: validationMessage }, { status: 400 });
    }

    const data = await readApplications();

    const newApplication: Application = {
      id: crypto.randomUUID(),
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
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to submit application",
      },
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
    const { body, context } = await readSignedAdminJson<ReviewApplicationRequest>(req, "admin");
    const id = typeof body.id === "string" ? normalizeApplicationText(body.id) : "";
    const action = typeof body.action === "string" ? body.action : "";
    const rejectionReason =
      typeof body.rejectionReason === "string"
        ? normalizeApplicationText(body.rejectionReason)
        : "";

    if (!id || !isApplicationReviewAction(action)) {
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
    const applicationIndex = data.applications.findIndex((application) => application.id === id);

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
      application.reviewedBy = context.walletAddress;
      application.rejectionReason = null;

      // Add to allowlist
      const allowlist = await readAllowlist();
      const alreadyInAllowlist = allowlist.collections.some(
        (collection) => matchesAllowlistIdentifier(collection, application.collectionAddress)
      );

      if (!alreadyInAllowlist) {
        allowlist.collections.push({
          collectionAddress: application.collectionAddress,
          mintAuthority: application.collectionAddress,
          name: application.collectionName,
          category: application.category,
          addedAt: Date.now(),
          addedBy: context.walletAddress,
          verified: true,
        });
        await writeAllowlist(allowlist);
      }
    } else if (action === "reject") {
      application.status = "rejected";
      application.reviewedAt = Date.now();
      application.reviewedBy = context.walletAddress;
      application.rejectionReason = rejectionReason;
    }

    await writeApplications(data);

    return NextResponse.json({
      success: true,
      application,
    });
  } catch (error) {
    return toAdminRequestErrorResponse(
      error instanceof Error ? error : new Error("Failed to update application"),
      "Failed to update application"
    );
  }
}
