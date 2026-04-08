import { NextRequest, NextResponse } from "next/server";
import {
  getCuratedMarketplaceListing,
  type MarketplaceSource,
} from "@/app/lib/digital-art-marketplaces";

function isMarketplaceSource(value: string | null): value is MarketplaceSource {
  return value === "magiceden" || value === "tensor";
}

export async function GET(req: NextRequest) {
  try {
    const searchParams = req.nextUrl.searchParams;
    const collectionAddress = searchParams.get("collection");
    const source = searchParams.get("source");
    const mint = searchParams.get("mint");

    if (!collectionAddress || !mint || !isMarketplaceSource(source)) {
      return NextResponse.json(
        { ok: false, error: "Missing collection, mint, or source" },
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
  } catch (error: any) {
    return NextResponse.json(
      {
        ok: false,
        error: error?.message || "Failed to fetch marketplace listing",
      },
      { status: 500 }
    );
  }
}
