import { NextRequest, NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";

const TREASURY_WALLET = "6drXw31FjHch4ixXa4ngTyUD2cySUs3mpcB2YYGA9g7P";
const SUBMISSIONS_FILE = path.join(process.cwd(), "data", "submissions.json");

export interface Submission {
  id: string;
  name: string;
  category: "TCG Cards" | "Sports Cards" | "Watches" | "Spirits" | "Digital Art" | "Sealed Product" | "Merchandise";
  description: string;
  photos: string[]; // URLs
  sellerWallet: string;
  contact: string; // email or telegram
  status: "pending" | "approved" | "rejected" | "minted" | "delivered";
  adminNotes?: string;
  submittedAt: number;
  reviewedAt?: number;
  // Minting fields
  nftName?: string;
  nftSymbol?: string;
  nftImageUri?: string;
  nftMetadata?: Record<string, any>;
  mintedAt?: number;
}

interface SubmissionsData {
  submissions: Submission[];
}

async function readSubmissions(): Promise<SubmissionsData> {
  try {
    const content = await fs.readFile(SUBMISSIONS_FILE, "utf-8");
    return JSON.parse(content);
  } catch {
    return { submissions: [] };
  }
}

async function writeSubmissions(data: SubmissionsData): Promise<void> {
  await fs.writeFile(SUBMISSIONS_FILE, JSON.stringify(data, null, 2), "utf-8");
}

const ADMIN_SECRET = process.env.ADMIN_SECRET;

function isAdminWallet(wallet?: string, secret?: string): boolean {
  if (!ADMIN_SECRET) return false;
  return wallet === TREASURY_WALLET && secret === ADMIN_SECRET;
}

// GET — list all submissions (admin only) or user's own submissions
export async function GET(req: NextRequest) {
  try {
    const wallet = req.nextUrl.searchParams.get("wallet");
    const adminWallet = req.headers.get("x-admin-wallet") || undefined;
    const adminSecretHeader = req.headers.get("x-admin-secret") || undefined;
    const data = await readSubmissions();

    // If requesting user's own submissions, no admin check needed
    if (wallet && !isAdminWallet(adminWallet, adminSecretHeader)) {
      const filtered = data.submissions.filter(s => s.sellerWallet === wallet);
      return NextResponse.json({ ok: true, submissions: filtered });
    }

    // If admin requesting all submissions
    if (isAdminWallet(adminWallet, adminSecretHeader)) {
      return NextResponse.json({ ok: true, submissions: data.submissions });
    }

    // Otherwise, reject
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  } catch {
    return NextResponse.json({ error: "Failed to read submissions" }, { status: 500 });
  }
}

// POST — submit new submission (public)
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { name, category, description, photos, sellerWallet, contact } = body;

    // Validate required fields
    if (!name || !category || !description || !sellerWallet || !contact) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    // Validate category
    const validCategories = ["TCG Cards", "Sports Cards", "Watches", "Spirits", "Digital Art", "Sealed Product", "Merchandise"];
    if (!validCategories.includes(category)) {
      return NextResponse.json({ error: "Invalid category" }, { status: 400 });
    }

    // Validate photos array
    if (!Array.isArray(photos) || photos.length === 0 || photos.length > 5) {
      return NextResponse.json({ error: "Please provide 1-5 photo URLs" }, { status: 400 });
    }

    const data = await readSubmissions();

    // Create submission
    const submission: Submission = {
      id: `sub-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      name,
      category,
      description,
      photos,
      sellerWallet,
      contact,
      status: "pending",
      submittedAt: Date.now(),
    };

    data.submissions.push(submission);
    await writeSubmissions(data);

    return NextResponse.json({ ok: true, submission }, { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// PATCH — update submission status (admin only)
export async function PATCH(req: NextRequest) {
  try {
    const adminWallet = req.headers.get("x-admin-wallet") || undefined;
    const adminSecretHeader = req.headers.get("x-admin-secret") || undefined;

    if (!isAdminWallet(adminWallet, adminSecretHeader)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    const body = await req.json();
    const { id, status, adminNotes, nftName, nftSymbol, nftImageUri, nftMetadata } = body;

    if (!id || !status) {
      return NextResponse.json({ error: "Missing id or status" }, { status: 400 });
    }

    const validStatuses = ["pending", "approved", "rejected", "minted", "delivered"];
    if (!validStatuses.includes(status)) {
      return NextResponse.json({ error: "Invalid status" }, { status: 400 });
    }

    const data = await readSubmissions();
    const submission = data.submissions.find(s => s.id === id);

    if (!submission) {
      return NextResponse.json({ error: "Submission not found" }, { status: 404 });
    }

    // Update submission
    submission.status = status as any;
    submission.reviewedAt = Date.now();

    if (adminNotes) {
      submission.adminNotes = adminNotes;
    }

    // If updating to minted, store mint metadata
    if (status === "minted") {
      submission.nftName = nftName || submission.name;
      submission.nftSymbol = nftSymbol || "Artifacte";
      submission.nftImageUri = nftImageUri;
      submission.nftMetadata = nftMetadata;
      submission.mintedAt = Date.now();
    }

    await writeSubmissions(data);

    return NextResponse.json({ ok: true, submission });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
