import { NextRequest, NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";
import { hasAdminAccess } from "@/lib/admin";
import {
  ADMIN_CORE_ROYALTY_BASIS_POINTS,
  buildMetaplexCompatibleMetadata,
  DEFAULT_NFT_SYMBOL,
  getMetadataFieldStatus,
  METADATA_BYTE_LIMITS,
  normalizeMetadataText,
  normalizeMetadataUri,
  sanitizeMetadataSymbol,
} from "@/lib/nft-metadata";
import {
  isSubmissionCategory,
  isSubmissionStatus,
  normalizeOptionalSellerWallet,
  normalizePhotoUrls,
  normalizeSubmissionText,
  type Submission,
  type SubmissionMetadataObject,
  validateSubmissionFields,
} from "@/lib/submissions";

const SUBMISSIONS_FILE = path.join(process.cwd(), "data", "submissions.json");

interface SubmissionsData {
  submissions: Submission[];
}

interface SubmissionRequestBody {
  name?: string;
  category?: string;
  description?: string;
  photos?: string[];
  sellerWallet?: string | null;
  contact?: string;
}

interface SubmissionPatchBody {
  id?: string;
  status?: string;
  adminNotes?: string;
  nftName?: string;
  nftSymbol?: string;
  nftImageUri?: string;
  nftMetadata?: SubmissionMetadataObject;
}

function isMetadataObject(
  value?: SubmissionMetadataObject[keyof SubmissionMetadataObject] | SubmissionMetadataObject | null
): value is SubmissionMetadataObject {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function extractMetadataAttributes(metadata?: SubmissionMetadataObject) {
  if (!metadata) {
    return [];
  }

  if (Array.isArray(metadata.attributes)) {
    return metadata.attributes
      .flatMap((attribute) => {
        if (!isMetadataObject(attribute)) {
          return [];
        }

        const traitType = normalizeMetadataText(String(attribute.trait_type ?? ""));
        const value = normalizeMetadataText(String(attribute.value ?? ""));

        return traitType && value ? [{ trait_type: traitType, value }] : [];
      })
      .filter((attribute) => attribute.trait_type && attribute.value);
  }

  return Object.entries(metadata)
    .filter(([key]) => !["name", "symbol", "description", "image", "external_url", "seller_fee_basis_points", "properties", "attributes"].includes(key))
    .map(([trait_type, value]) => ({
      trait_type: normalizeMetadataText(trait_type),
      value: normalizeMetadataText(String(value ?? "")),
    }))
    .filter((attribute) => attribute.trait_type && attribute.value);
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
  if (hasAdminAccess(wallet)) return true;
  // Also allow secret-based access if ADMIN_SECRET is configured
  if (ADMIN_SECRET && secret === ADMIN_SECRET) return true;
  return false;
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
  let body: SubmissionRequestBody;

  try {
    body = (await req.json()) as SubmissionRequestBody;
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  try {
    const name = typeof body.name === "string" ? normalizeSubmissionText(body.name) : "";
    const category = typeof body.category === "string" ? body.category : "";
    const description =
      typeof body.description === "string"
        ? normalizeSubmissionText(body.description)
        : "";
    const photos = Array.isArray(body.photos)
      ? normalizePhotoUrls(body.photos.filter((photo) => typeof photo === "string"))
      : [];
    const sellerWallet =
      typeof body.sellerWallet === "string"
        ? normalizeOptionalSellerWallet(body.sellerWallet)
        : null;
    const contact =
      typeof body.contact === "string" ? normalizeSubmissionText(body.contact) : "";

    const validationMessage = validateSubmissionFields({
      name,
      category,
      description,
      photos,
      contact,
    });

    if (validationMessage) {
      return NextResponse.json({ error: validationMessage }, { status: 400 });
    }

    if (!isSubmissionCategory(category)) {
      return NextResponse.json({ error: "Invalid category" }, { status: 400 });
    }

    const data = await readSubmissions();

    const submission: Submission = {
      id: `sub-${crypto.randomUUID()}`,
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
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Submission failed" },
      { status: 500 }
    );
  }
}

// PATCH — update submission status (admin only)
export async function PATCH(req: NextRequest) {
  let body: SubmissionPatchBody;

  try {
    body = (await req.json()) as SubmissionPatchBody;
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  try {
    const adminWallet = req.headers.get("x-admin-wallet") || undefined;
    const adminSecretHeader = req.headers.get("x-admin-secret") || undefined;

    if (!isAdminWallet(adminWallet, adminSecretHeader)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    const id = typeof body.id === "string" ? body.id : "";
    const status = typeof body.status === "string" ? body.status : "";
    const adminNotes = typeof body.adminNotes === "string" ? body.adminNotes : undefined;
    const nftName = typeof body.nftName === "string" ? body.nftName : undefined;
    const nftSymbol = typeof body.nftSymbol === "string" ? body.nftSymbol : undefined;
    const nftImageUri = typeof body.nftImageUri === "string" ? body.nftImageUri : undefined;
    const nftMetadata = body.nftMetadata;

    if (!id || !status) {
      return NextResponse.json({ error: "Missing id or status" }, { status: 400 });
    }

    if (!isSubmissionStatus(status)) {
      return NextResponse.json({ error: "Invalid status" }, { status: 400 });
    }

    const data = await readSubmissions();
    const submission = data.submissions.find(s => s.id === id);

    if (!submission) {
      return NextResponse.json({ error: "Submission not found" }, { status: 404 });
    }

    // Update submission
    submission.status = status;
    submission.reviewedAt = Date.now();

    if (adminNotes) {
      submission.adminNotes = adminNotes;
    }

    // If updating to minted, store mint metadata
    if (status === "minted") {
      const nextName = getMetadataFieldStatus(nftName || submission.name, METADATA_BYTE_LIMITS.name);
      if (!nextName.value || !nextName.fits) {
        return NextResponse.json({ error: `NFT name must fit within ${METADATA_BYTE_LIMITS.name} UTF-8 bytes` }, { status: 400 });
      }

      const nextSymbolInput = normalizeMetadataText(nftSymbol || DEFAULT_NFT_SYMBOL) || DEFAULT_NFT_SYMBOL;
      const nextSymbolStatus = getMetadataFieldStatus(nextSymbolInput, METADATA_BYTE_LIMITS.symbol);
      if (!nextSymbolStatus.fits) {
        return NextResponse.json({ error: `NFT symbol must fit within ${METADATA_BYTE_LIMITS.symbol} UTF-8 bytes` }, { status: 400 });
      }

      const metadataImage = typeof nftMetadata?.image === "string" ? nftMetadata.image : "";
      const metadataDescriptionSource =
        typeof nftMetadata?.description === "string"
          ? nftMetadata.description
          : `${submission.category} minted on Artifacte`;
      const properties = isMetadataObject(nftMetadata?.properties)
        ? nftMetadata.properties
        : undefined;
      const creators = Array.isArray(properties?.creators) ? properties.creators : [];
      const firstCreator = creators[0];

      const nextImageUri = normalizeMetadataUri(nftImageUri || metadataImage || "");
      const metadataDescription = normalizeMetadataText(
        metadataDescriptionSource
      );
      const creatorAddress = isMetadataObject(firstCreator)
        ? normalizeMetadataText(String(firstCreator.address ?? ""))
        : "";
      const externalUrl =
        typeof nftMetadata?.external_url === "string" ? nftMetadata.external_url : undefined;

      submission.nftName = nextName.value;
      submission.nftSymbol = sanitizeMetadataSymbol(nextSymbolInput);
      submission.nftImageUri = nextImageUri;
      submission.nftMetadata = buildMetaplexCompatibleMetadata({
        name: submission.nftName,
        symbol: submission.nftSymbol,
        description: metadataDescription,
        image: nextImageUri,
        attributes: extractMetadataAttributes(nftMetadata),
        creatorAddress,
        externalUrl,
        sellerFeeBasisPoints: ADMIN_CORE_ROYALTY_BASIS_POINTS,
      });
      submission.mintedAt = Date.now();
    }

    await writeSubmissions(data);

    return NextResponse.json({ ok: true, submission });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to update submission" },
      { status: 500 }
    );
  }
}
