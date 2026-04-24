import { NextRequest, NextResponse } from "next/server";
import { address } from "@solana/kit";

import {
  getCuratedMarketplaceListing,
  type MarketplaceSource,
} from "@/app/lib/digital-art-marketplaces";

function parseAddress(value: string | null, fieldName: string): string {
  if (!value?.trim()) {
    throw new Error(`Missing ${fieldName}`);
  }

  return `${address(value.trim())}`;
}

function isMarketplaceSource(value: string | null): value is MarketplaceSource {
  return value === "magiceden" || value === "tensor";
}

export async function GET(req: NextRequest) {
  try {
    const searchParams = req.nextUrl.searchParams;
    const collectionAddress = parseAddress(searchParams.get("collection"), "collection");
    const source = searchParams.get("source");
    const mint = parseAddress(searchParams.get("mint"), "mint");

    if (!isMarketplaceSource(source)) {
      return NextResponse.json(
        { ok: false, error: "Missing source" },
        { status: 400 }
      );
    }

    const listing = await getCuratedMarketplaceListing({
      collectionAddress,
      source,
      mint,
    });

    if (!listing) {
      return NextResponse.json(
        { ok: false, error: "Listing not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      ok: true,
      listing,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to fetch marketplace listing";
    const status = message.startsWith("Missing") || message.startsWith("Invalid") ? 400 : 500;

    return NextResponse.json(
      {
        ok: false,
        error: message,
      },
      { status }
    );
  }
}
