import { NextRequest, NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";

const ADMIN_WALLET = "DDSpvAK8DbuAdEaaBHkfLieLPSJVCWWgquFAA3pvxXoX";
const ALLOWLIST_FILE = path.join(process.cwd(), "data", "allowlist.json");

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

function validateAdmin(adminWallet: string): boolean {
  return adminWallet === ADMIN_WALLET;
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
    const { mintAuthority, name, category, adminWallet } = body;

    if (!validateAdmin(adminWallet)) {
      return NextResponse.json(
        { error: "Unauthorized: Invalid admin wallet" },
        { status: 403 }
      );
    }

    if (!mintAuthority || !name || !category) {
      return NextResponse.json(
        { error: "Missing required fields: mintAuthority, name, category" },
        { status: 400 }
      );
    }

    const allowlist = await readAllowlist();

    // Check if already exists
    const exists = allowlist.collections.some(
      (c) => c.mintAuthority === mintAuthority
    );
    if (exists) {
      return NextResponse.json(
        { error: "Collection already in allowlist" },
        { status: 409 }
      );
    }

    // Add new entry
    const newEntry: AllowlistEntry = {
      mintAuthority,
      name,
      category,
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
    const { mintAuthority, adminWallet } = body;

    if (!validateAdmin(adminWallet)) {
      return NextResponse.json(
        { error: "Unauthorized: Invalid admin wallet" },
        { status: 403 }
      );
    }

    if (!mintAuthority) {
      return NextResponse.json(
        { error: "Missing required field: mintAuthority" },
        { status: 400 }
      );
    }

    const allowlist = await readAllowlist();
    const initialLength = allowlist.collections.length;
    allowlist.collections = allowlist.collections.filter(
      (c) => c.mintAuthority !== mintAuthority
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
