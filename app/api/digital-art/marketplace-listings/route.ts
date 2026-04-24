import { NextRequest, NextResponse } from "next/server";
import { address } from "@solana/kit";

import { getCuratedMarketplaceListings } from "@/app/lib/digital-art-marketplaces";
import type { MarketplaceSource } from "@/app/lib/digital-art-marketplaces";

function parseCollectionAddress(value: string | null): string {
  if (!value?.trim()) {
    throw new Error("Missing collection");
  }

  return `${address(value.trim())}`;
}

function parseLimit(value: string | null): number | undefined {
  if (!value) {
    return undefined;
  }

  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error("Invalid limit");
  }

  return parsed;
}

function parseSource(value: string | null): MarketplaceSource | undefined {
  if (!value) {
    return undefined;
  }

  if (value === "magiceden" || value === "tensor") {
    return value;
  }

  throw new Error("Invalid source");
}

export async function GET(req: NextRequest) {
  try {
    const searchParams = req.nextUrl.searchParams;
    const collectionAddress = parseCollectionAddress(searchParams.get("collection"));
    const cursor = searchParams.get("cursor");
    const limit = parseLimit(searchParams.get("limit"));
    const source = parseSource(searchParams.get("source"));
    const result = await getCuratedMarketplaceListings({
      collectionAddress,
      cursor,
      limit,
      source,
    });

    return NextResponse.json({
      ok: true,
      ...result,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to fetch marketplace listings";
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
