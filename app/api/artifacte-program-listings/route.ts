import { NextRequest, NextResponse } from "next/server";
import { loadActiveArtifacteFixedPriceListings } from "@/lib/artifacte-listings";

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl;
    const page = Math.max(1, parseInt(searchParams.get("page") || "1"));
    const perPage = Math.min(100, Math.max(1, parseInt(searchParams.get("perPage") || "24")));
    const sort = searchParams.get("sort") || "price-desc"; // price-asc | price-desc
    const q = searchParams.get("q") || "";

    const allListings = await loadActiveArtifacteFixedPriceListings();
    const filteredListings = (
      q
        ? allListings.filter((listing) => listing.name.toLowerCase().includes(q.toLowerCase()))
        : allListings
    ).slice();

    // Sort
    filteredListings.sort((a, b) => {
      if (sort === "price-asc") return a.usdcPrice - b.usdcPrice;
      return b.usdcPrice - a.usdcPrice; // price-desc (default)
    });

    const total = filteredListings.length;
    const start = (page - 1) * perPage;
    const paginated = filteredListings.slice(start, start + perPage);

    return NextResponse.json({ listings: paginated, total });
  } catch (error) {
    console.error("[artifacte-program-listings] error:", error);
    return NextResponse.json({ listings: [], total: 0, error: "Failed to fetch listings" }, { status: 500 });
  }
}
