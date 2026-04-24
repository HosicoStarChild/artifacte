import { NextRequest, NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";
import { hasAdminAccess } from "@/lib/admin";
import {
  readSignedAdminJson,
  toAdminRequestErrorResponse,
} from "@/lib/server/admin-request";
const LISTINGS_FILE = path.join(process.cwd(), "data", "pending-listings.json");
const ALLOWLIST_FILE = path.join(process.cwd(), "data", "allowlist.json");

const BUNDLED_COLLECTIONS = [
  "J1S9H3QjnRtBbbuD4HjPV6RpRhwuk4zKbxsnCHuTgh9w",
  "8Rt3Ayqth4DAiPnW9MDFi63TiQJHmohfTWLMQFHi4KZH",
  "SMBtHCCC6RYRutFEPb4gZqeBLUZbMNhRKaMKZZLHi7W",
  "BUjZjAS2vbbb65g7Z1Ca9ZRVYoJscURG5L3AkVvHP9ac",
  "6mszaj17KSfVqADrQj3o4W3zoLMTykgmV37W4QadCczK",
  "HJx4HRAT3RiFq7cy9fSrvP92usAmJ7bJgPccQTyroT2r",
  "1yPMtWU5aqcF72RdyRD5yipmcMRC8NGNK59NvYubLkZ",
  "J6RJFQfLgBTcoAt3KoZFiTFW9AbufsztBNDgZ7Znrp1Q",
  "CjL5WpAmf4cMEEGwZGTfTDKWok9a92ykq9aLZrEK2D5H",
];

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

interface ListingRequestBody {
  auctionDuration?: number;
  collectionAddress?: string;
  collectionName?: string;
  description?: string;
  listingType?: "fixed" | "auction";
  nftImage?: string;
  nftMint?: string;
  nftName?: string;
  price?: number | string;
  seller?: string;
}

interface ListingPatchBody {
  action?: "approve" | "reject";
  id?: string;
}

interface AllowlistData {
  collections: Array<{ collectionAddress?: string; mintAuthority?: string }>;
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

async function isCollectionAllowed(collectionAddress: string): Promise<boolean> {
  try {
    const content = await fs.readFile(ALLOWLIST_FILE, "utf-8");
    const data = JSON.parse(content) as AllowlistData;
    return data.collections.some(
      (collection) =>
        collection.collectionAddress === collectionAddress ||
        collection.mintAuthority === collectionAddress
    );
  } catch {
    return BUNDLED_COLLECTIONS.includes(collectionAddress);
  }
}

// GET — list pending (admin) or user's own listings
export async function GET(req: NextRequest) {
  try {
    const wallet = req.nextUrl.searchParams.get("wallet");
    const status = req.nextUrl.searchParams.get("status");
    const data = await readListings();
    
    let filtered = data.listings;
    if (wallet && !hasAdminAccess(wallet)) {
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
    const body = (await req.json()) as ListingRequestBody;
    const { nftMint, nftName, nftImage, collectionName, collectionAddress, seller, price, listingType, auctionDuration, description } = body;

    if (!nftMint || !seller || !price || !collectionAddress) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    // Check collection allowlist
    const collectionOk = await isCollectionAllowed(collectionAddress);
    if (!collectionOk) {
      return NextResponse.json({ error: "Collection not approved for listing on Artifacte." }, { status: 403 });
    }

    // No wallet whitelist — anyone with an approved collection NFT can submit
    // Admin approval queue is the final gate

    const normalizedPrice =
      typeof price === "number" ? price : Number.parseFloat(price);

    if (!Number.isFinite(normalizedPrice) || normalizedPrice <= 0) {
      return NextResponse.json({ error: "Invalid price" }, { status: 400 });
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
      price: normalizedPrice,
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
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to submit listing" },
      { status: 500 }
    );
  }
}

// PATCH — approve or reject (admin only)
export async function PATCH(req: NextRequest) {
  try {
    const { body } = await readSignedAdminJson<ListingPatchBody>(req, "admin");
    const { id, action } = body;

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
  } catch (error) {
    return toAdminRequestErrorResponse(
      error instanceof Error ? error : new Error("Failed to update listing"),
      "Failed to update listing"
    );
  }
}
