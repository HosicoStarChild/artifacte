import { NextRequest, NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";

const ADMIN_WALLET = "DDSpvAK8DbuAdEaaBHkfLieLPSJVCWWgquFAA3pvxXoX";
const WHITELIST_FILE = path.join(process.cwd(), "data", "wallet-whitelist.json");

interface WalletEntry {
  address: string;
  name: string;
  role: "admin" | "seller";
  addedAt: number;
  enabled: boolean;
}

interface WhitelistData {
  wallets: WalletEntry[];
}

async function readWhitelist(): Promise<WhitelistData> {
  try {
    const content = await fs.readFile(WHITELIST_FILE, "utf-8");
    return JSON.parse(content);
  } catch {
    return { wallets: [] };
  }
}

async function writeWhitelist(data: WhitelistData): Promise<void> {
  await fs.writeFile(WHITELIST_FILE, JSON.stringify(data, null, 2), "utf-8");
}

export async function GET() {
  try {
    const data = await readWhitelist();
    return NextResponse.json({ ok: true, wallets: data.wallets });
  } catch {
    return NextResponse.json({ error: "Failed to read whitelist" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { address, name, role, adminWallet } = body;

    if (adminWallet !== ADMIN_WALLET) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }
    if (!address || !name) {
      return NextResponse.json({ error: "Missing address or name" }, { status: 400 });
    }

    const data = await readWhitelist();
    if (data.wallets.some(w => w.address === address)) {
      return NextResponse.json({ error: "Wallet already whitelisted" }, { status: 409 });
    }

    const entry: WalletEntry = {
      address,
      name,
      role: role || "seller",
      addedAt: Date.now(),
      enabled: true,
    };
    data.wallets.push(entry);
    await writeWhitelist(data);

    return NextResponse.json({ ok: true, wallet: entry });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const body = await req.json();
    const { address, adminWallet } = body;

    if (adminWallet !== ADMIN_WALLET) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    const data = await readWhitelist();
    const before = data.wallets.length;
    data.wallets = data.wallets.filter(w => w.address !== address);
    if (data.wallets.length === before) {
      return NextResponse.json({ error: "Wallet not found" }, { status: 404 });
    }

    await writeWhitelist(data);
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
