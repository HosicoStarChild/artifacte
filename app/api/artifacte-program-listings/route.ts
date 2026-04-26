import { unstable_rethrow } from "next/navigation";
import { NextRequest, NextResponse } from "next/server";
import { loadActiveArtifacteFixedPriceListings } from "@/lib/artifacte-listings";

type ArtifacteListingsSort = "newest" | "price-asc" | "price-desc";

function parsePositiveIntegerParam(value: string | null, fallbackValue: number, min: number, max: number): number {
  const parsedValue = Number.parseInt(value || `${fallbackValue}`, 10);

  if (!Number.isFinite(parsedValue)) {
    return fallbackValue;
  }

  return Math.min(max, Math.max(min, parsedValue));
}

function parseSortParam(value: string | null): ArtifacteListingsSort {
  if (value === "price-asc" || value === "price-desc" || value === "newest") {
    return value;
  }

  return "price-desc";
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl;
    const page = parsePositiveIntegerParam(searchParams.get("page"), 1, 1, 10_000);
    const perPage = parsePositiveIntegerParam(searchParams.get("perPage"), 24, 1, 100);
    const sort = parseSortParam(searchParams.get("sort"));
    const query = searchParams.get("q")?.trim().toLowerCase() || "";

    const allListings = await loadActiveArtifacteFixedPriceListings();
    const filteredListings = (
      query
        ? allListings.filter((listing) => (
            listing.name.toLowerCase().includes(query)
            || listing.id.toLowerCase().includes(query)
            || listing.nftAddress.toLowerCase().includes(query)
          ))
        : allListings
    ).slice();

    if (sort === "price-asc") {
      filteredListings.sort((left, right) => left.usdcPrice - right.usdcPrice);
    } else if (sort === "price-desc") {
      filteredListings.sort((left, right) => right.usdcPrice - left.usdcPrice);
    }

    const total = filteredListings.length;
    const start = (page - 1) * perPage;
    const paginated = filteredListings.slice(start, start + perPage);

    return NextResponse.json({ listings: paginated, total }, {
      headers: { "Cache-Control": "public, max-age=30, stale-while-revalidate=120" },
    });
  } catch (error) {
    unstable_rethrow(error);
    console.error("[artifacte-program-listings] error:", error);
    return NextResponse.json({ listings: [], total: 0, error: "Failed to fetch listings" }, { status: 500 });
  }
}
