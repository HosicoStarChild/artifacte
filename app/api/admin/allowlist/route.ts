import { NextRequest, NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";

const ADMIN_WALLET = "DDSpvAK8DbuAdEaaBHkfLieLPSJVCWWgquFAA3pvxXoX";
const ADMIN_SECRET = process.env.ADMIN_SECRET;
const ALLOWLIST_FILE = path.join(process.cwd(), "data", "allowlist.json");

// Bundled fallback for Vercel (fs.readFile fails in serverless)
const BUNDLED_COLLECTIONS = [
  { collectionAddress: "J1S9H3QjnRtBbbuD4HjPV6RpRhwuk4zKbxsnCHuTgh9w", name: "Mad Lads", category: "Digital Art", image: "https://madlads-collection.s3.us-west-2.amazonaws.com/_collection.png", supply: 9968, verified: true },
  { collectionAddress: "8Rt3Ayqth4DAiPnW9MDFi63TiQJHmohfTWLMQFHi4KZH", name: "SMB Gen3", category: "Digital Art", image: "https://gateway.irys.xyz/CAqfaUJzwbwmmyommhgHWqwQVcxuRtqnNrprm88YDquj", supply: 5000, verified: true },
  { collectionAddress: "SMBtHCCC6RYRutFEPb4gZqeBLUZbMNhRKaMKZZLHi7W", name: "SMB Gen2", category: "Digital Art", image: "https://arweave.net/lZ5FdIVagNoNvI4QFoHhB6Xyn4oVGLV9xOTW32WBC20", supply: 4992, verified: true },
  { collectionAddress: "BUjZjAS2vbbb65g7Z1Ca9ZRVYoJscURG5L3AkVvHP9ac", name: "Famous Fox Federation", category: "Digital Art", image: "https://arweave.net/mgvMZbiis8AE_Kkj1Om5clxpseOiZB-2Q4QFUVavD10", supply: 9992, verified: true },
  { collectionAddress: "6mszaj17KSfVqADrQj3o4W3zoLMTykgmV37W4QadCczK", name: "Claynosaurz", category: "Digital Art", image: "https://nftstorage.link/ipfs/bafybeiese3bgyfewt2r3dxvgups2blc3rwh2utvidirxgxq527mhcv3ydy", supply: 10232, verified: true },
  { collectionAddress: "HJx4HRAT3RiFq7cy9fSrvP92usAmJ7bJgPccQTyroT2r", name: "Taiyo Robotics", category: "Digital Art", image: "https://nftstorage.link/ipfs/bafybeibtvj6cudhrllobbfpctvx5wfnvkyrusajsyaj36bhoxfpqzai26y/0.png", supply: 2348, verified: true },
  { collectionAddress: "1yPMtWU5aqcF72RdyRD5yipmcMRC8NGNK59NvYubLkZ", name: "Claynosaurz: Call of Saga", category: "Digital Art", image: "https://arweave.net/oXUNrsF8ohrCPh8A0ok-AJlILZXPtcOX66dgRfhNqLI?ext=gif", supply: 1999, verified: true },
  { collectionAddress: "J6RJFQfLgBTcoAt3KoZFiTFW9AbufsztBNDgZ7Znrp1Q", name: "Galactic Gecko", category: "Digital Art", image: "https://arweave.net/NFC1-rgJ9tE1BkfJjirVlQ1_-cNbj6Mwm_BGmQryaYk", supply: 10000, verified: true },
  { collectionAddress: "CjL5WpAmf4cMEEGwZGTfTDKWok9a92ykq9aLZrEK2D5H", name: "little swag world", category: "Digital Art", image: "https://nftstorage.link/ipfs/bafybeiddn3ujufppfg3azha6xrv34kw7t4uznwitve25egygq2v73uagq4", supply: 3328, verified: true },
];

interface AllowlistEntry {
  mintAuthority?: string;
  collectionAddress?: string;
  name: string;
  category: string;
  image?: string;
  supply?: number;
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
    const { mintAuthority, name, category, adminWallet, adminSecret } = body;

    if (!validateAdmin(adminWallet, adminSecret)) {
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
    const { mintAuthority, adminWallet, adminSecret } = body;

    if (!validateAdmin(adminWallet, adminSecret)) {
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
