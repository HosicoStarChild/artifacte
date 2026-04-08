import { NextRequest, NextResponse } from "next/server";
import { getCuratedMarketplaceListings } from "@/app/lib/digital-art-marketplaces";

export async function GET(req: NextRequest) {
  try {
    const searchParams = req.nextUrl.searchParams;
    const collectionAddress = searchParams.get("collection");
    const cursor = searchParams.get("cursor");
    const limitParam = searchParams.get("limit");

    if (!collectionAddress) {
      return NextResponse.json(
        { ok: false, error: "Missing collection" },
        { status: 400 }
      );
    }

    const limit = limitParam ? Number(limitParam) : undefined;
    const result = await getCuratedMarketplaceListings({
      collectionAddress,
      cursor,
      limit: Number.isFinite(limit) ? limit : undefined,
    });

    return NextResponse.json({
      ok: true,
      ...result,
    });
  } catch (error: any) {
    return NextResponse.json(
      {
        ok: false,
        error: error?.message || "Failed to fetch marketplace listings",
      },
      { status: 500 }
    );
  }
}
