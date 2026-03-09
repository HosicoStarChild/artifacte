import { NextRequest, NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";

const ADMIN_WALLET = "DDSpvAK8DbuAdEaaBHkfLieLPSJVCWWgquFAA3pvxXoX";
const LISTINGS_FILE = path.join(process.cwd(), "data", "pending-listings.json");
const WHITELIST_FILE = path.join(process.cwd(), "data", "wallet-whitelist.json");
const ALLOWLIST_FILE = path.join(process.cwd(), "data", "allowlist.json");

interface PendingListing {
  id: string;
  nftMint: string;
  nftName: string;
  nftImage: string;
  collectionName: string;
  collectionAddress: string;
  seller: string;
  price: number;
  currency: "SOL";
  listingType: "fixed" | "auction";
  auctionDuration?: number; // hours
  description: string;
  status: "pending" | "approved" | "rejected";
  submittedAt: number;
  reviewedAt?: number;
}

async function readListings(): Promise<{ listings: PendingListing[] }> {
  try {
    const content = await fs.readFile(LISTINGS_FILE, "utf-8");
    return JSON.parse(content);
  } catch {
    return { listings: [] };
  }
}

async function writeListings(data: { listings: PendingListing[] }): Promise<void> {
  await fs.writeFile(LISTINGS_FILE, JSON.stringify(data, null, 2), "utf-8");
}

async function isWalletWhitelisted(address: string): Promise<boolean> {
  try {
    const content = await fs.readFile(WHITELIST_FILE, "utf-8");
    const data = JSON.parse(content);
    return data.wallets.some((w: any) => w.address === address && w.enabled);
  } catch {
    return false;
  }
}

async function isCollectionAllowed(collectionAddress: string): Promise<boolean> {
  try {
    const content = await fs.readFile(ALLOWLIST_FILE, "utf-8");
    const data = JSON.parse(content);
    return data.collections.some((c: any) => 
      c.collectionAddress === collectionAddress || c.mintAuthority === collectionAddress
    );
  } catch {
    return false;
  }
}

// GET — list pending (admin) or user's own listings
export async function GET(req: NextRequest) {
  try {
    const wallet = req.nextUrl.searchParams.get("wallet");
    const status = req.nextUrl.searchParams.get("status");
    const data = await readListings();
    
    let filtered = data.listings;
    if (wallet && wallet !== ADMIN_WALLET) {
      filtered = filtered.filter(l => l.seller === wallet);
    }
    if (status) {
      filtered = filtered.filter(l => l.status === status);
    }

    return NextResponse.json({ ok: true, listings: filtered });
  } catch {
    return NextResponse.json({ error: "Failed to read listings" }, { status: 500 });
  }
}

// POST — submit new listing
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { nftMint, nftName, nftImage, collectionName, collectionAddress, seller, price, listingType, auctionDuration, description } = body;

    if (!nftMint || !seller || !price || !collectionAddress) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    // Check wallet whitelist
    const walletOk = await isWalletWhitelisted(seller);
    if (!walletOk) {
      return NextResponse.json({ error: "Wallet not whitelisted. Apply for seller access first." }, { status: 403 });
    }

    // Check collection allowlist
    const collectionOk = await isCollectionAllowed(collectionAddress);
    if (!collectionOk) {
      return NextResponse.json({ error: "Collection not approved for listing on Artifacte." }, { status: 403 });
    }

    const data = await readListings();
    
    // Check for duplicate
    if (data.listings.some(l => l.nftMint === nftMint && l.status === "pending")) {
      return NextResponse.json({ error: "This NFT already has a pending listing" }, { status: 409 });
    }

    const listing: PendingListing = {
      id: `pl-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      nftMint,
      nftName: nftName || "Unknown NFT",
      nftImage: nftImage || "",
      collectionName: collectionName || "Unknown Collection",
      collectionAddress,
      seller,
      price: parseFloat(price),
      currency: "SOL",
      listingType: listingType || "fixed",
      auctionDuration: listingType === "auction" ? (auctionDuration || 72) : undefined,
      description: description || "",
      status: "pending",
      submittedAt: Date.now(),
    };

    data.listings.push(listing);
    await writeListings(data);

    return NextResponse.json({ ok: true, listing });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// PATCH — approve or reject (admin only)
export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json();
    const { id, action, adminWallet } = body;

    if (adminWallet !== ADMIN_WALLET) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }
    if (!id || !action || !["approve", "reject"].includes(action)) {
      return NextResponse.json({ error: "Missing id or invalid action" }, { status: 400 });
    }

    const data = await readListings();
    const listing = data.listings.find(l => l.id === id);
    if (!listing) {
      return NextResponse.json({ error: "Listing not found" }, { status: 404 });
    }

    listing.status = action === "approve" ? "approved" : "rejected";
    listing.reviewedAt = Date.now();
    await writeListings(data);

    return NextResponse.json({ ok: true, listing });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
