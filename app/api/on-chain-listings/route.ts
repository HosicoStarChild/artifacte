import { unstable_rethrow } from "next/navigation";
import { NextRequest, NextResponse } from "next/server";

import { address } from "@solana/kit";

import { getDigitalArtNativeListingsForCollections } from "@/app/digital-art/_lib/server-data";

function parseCollectionAddresses(searchParams: URLSearchParams): string[] {
  const rawValues = searchParams
    .getAll("collection")
    .flatMap((value) => value.split(","))
    .map((value) => value.trim())
    .filter(Boolean);

  return Array.from(new Set(rawValues.map((value) => `${address(value)}`)));
}

function lamportsToSol(lamports: number): number {
  return lamports / 1_000_000_000;
}

export async function GET(request: NextRequest) {
  try {
    const collectionAddresses = parseCollectionAddresses(request.nextUrl.searchParams);
    const listings = await getDigitalArtNativeListingsForCollections(collectionAddresses);

    return NextResponse.json({
      listings: listings.map((listing) => ({
        currentBid: listing.currentBidLamports ? lamportsToSol(listing.currentBidLamports) : 0,
        endTime: listing.endTime ?? 0,
        highestBidder: listing.highestBidder ?? "",
        nftCollection: listing.collectionName,
        nftImage: listing.imageSrc,
        nftMint: listing.nftMint,
        nftName: listing.name,
        pda: listing.listingPda,
        price: lamportsToSol(listing.priceLamports),
        royaltyBps: listing.royaltyBasisPoints,
        seller: listing.seller,
        status: "active",
      })),
      total: listings.length,
    });
  } catch (error) {
    unstable_rethrow(error);
    const message = error instanceof Error ? error.message : "Failed to fetch listings";
    const status = message.startsWith("Invalid") ? 400 : 500;

    if (status === 500) {
      console.error("[on-chain-listings]", error);
    }

    return NextResponse.json({ listings: [], error: message }, { status });
  }
}
