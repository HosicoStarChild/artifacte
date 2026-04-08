import { NextRequest, NextResponse } from "next/server";
import bundledAllowlist from "@/data/allowlist.json";
import type { AllowlistEntry } from "@/lib/allowlist";
import fs from "fs/promises";
import path from "path";

const ADMIN_WALLET = "DDSpvAK8DbuAdEaaBHkfLieLPSJVCWWgquFAA3pvxXoX";
const ADMIN_SECRET = process.env.ADMIN_SECRET;
const ALLOWLIST_FILE = path.join(process.cwd(), "data", "allowlist.json");

// Bundled fallback for Vercel (fs.readFile fails in serverless)
const BUNDLED_COLLECTIONS = bundledAllowlist.collections as AllowlistEntry[];

interface AllowlistData {
  collections: AllowlistEntry[];
}

function getCollectionIdentifier(entry: AllowlistEntry): string | null {
  return entry.collectionAddress || entry.mintAuthority || null;
}

async function readAllowlist(): Promise<AllowlistData> {
  try {
    const content = await fs.readFile(ALLOWLIST_FILE, "utf-8");
    return JSON.parse(content);
  } catch {
    return { collections: BUNDLED_COLLECTIONS as any[] };
  }
}

async function writeAllowlist(data: AllowlistData): Promise<void> {
  await fs.writeFile(ALLOWLIST_FILE, JSON.stringify(data, null, 2), "utf-8");
}

function validateAdmin(adminWallet: string, secret?: string): boolean {
  if (!ADMIN_SECRET) return false; // Fail closed if secret not configured
  return adminWallet === ADMIN_WALLET && secret === ADMIN_SECRET;
}

export async function GET() {
  try {
    const allowlist = await readAllowlist();
    return NextResponse.json({
      ok: true,
      collections: allowlist.collections,
    });
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to read allowlist" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      mintAuthority,
      collectionAddress,
      name,
      category,
      image,
      supply,
      description,
      links,
      marketplaces,
      matchBy,
      adminWallet,
      adminSecret,
    } = body;

    if (!validateAdmin(adminWallet, adminSecret)) {
      return NextResponse.json(
        { error: "Unauthorized: Invalid admin wallet" },
        { status: 403 }
      );
    }

    const identifier = collectionAddress || mintAuthority;
    if (!identifier || !name || !category) {
      return NextResponse.json(
        {
          error:
            "Missing required fields: collectionAddress or mintAuthority, name, category",
        },
        { status: 400 }
      );
    }

    const allowlist = await readAllowlist();

    // Check if already exists
    const exists = allowlist.collections.some(
      (c) => getCollectionIdentifier(c) === identifier
    );
    if (exists) {
      return NextResponse.json(
        { error: "Collection already in allowlist" },
        { status: 409 }
      );
    }

    // Add new entry
    const newEntry: AllowlistEntry = {
      ...(mintAuthority ? { mintAuthority } : {}),
      ...(collectionAddress ? { collectionAddress } : {}),
      name,
      category,
      ...(matchBy ? { matchBy } : {}),
      ...(image ? { image } : {}),
      ...(typeof supply === "number" ? { supply } : {}),
      ...(description ? { description } : {}),
      ...(links ? { links } : {}),
      ...(marketplaces ? { marketplaces } : {}),
      addedAt: Date.now(),
      addedBy: adminWallet,
      verified: true,
    };

    allowlist.collections.push(newEntry);
    await writeAllowlist(allowlist);

    return NextResponse.json({
      ok: true,
      collection: newEntry,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Failed to add collection" },
      { status: 500 }
    );
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const body = await req.json();
    const { mintAuthority, collectionAddress, adminWallet, adminSecret } = body;

    if (!validateAdmin(adminWallet, adminSecret)) {
      return NextResponse.json(
        { error: "Unauthorized: Invalid admin wallet" },
        { status: 403 }
      );
    }

    const identifier = collectionAddress || mintAuthority;
    if (!identifier) {
      return NextResponse.json(
        { error: "Missing required field: collectionAddress or mintAuthority" },
        { status: 400 }
      );
    }

    const allowlist = await readAllowlist();
    const initialLength = allowlist.collections.length;
    allowlist.collections = allowlist.collections.filter(
      (c) => getCollectionIdentifier(c) !== identifier
    );

    if (allowlist.collections.length === initialLength) {
      return NextResponse.json(
        { error: "Collection not found in allowlist" },
        { status: 404 }
      );
    }

    await writeAllowlist(allowlist);

    return NextResponse.json({
      ok: true,
      message: "Collection removed from allowlist",
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Failed to remove collection" },
      { status: 500 }
    );
  }
}
