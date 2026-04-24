import { NextRequest, NextResponse } from "next/server";

import type { MyListingsApiResponse, MyListingsPageData } from "@/lib/my-listings";
import { getMyListingsPageData, validateMyListingsWallet } from "@/lib/server/my-listings";

const routeCache = new Map<
  string,
  {
    data: MyListingsPageData;
    timestamp: number;
  }
>();

const CACHE_TTL_MS = 30_000;

export async function GET(
  request: NextRequest,
): Promise<NextResponse<MyListingsApiResponse>> {
  const wallet = request.nextUrl.searchParams.get("wallet");

  if (!wallet) {
    return NextResponse.json(
      {
        error: "Missing wallet parameter",
        ok: false,
      },
      { status: 400 },
    );
  }

  let validatedWallet: string;

  try {
    validatedWallet = validateMyListingsWallet(wallet);
  } catch {
    return NextResponse.json(
      {
        error: "Invalid wallet address format",
        ok: false,
      },
      { status: 400 },
    );
  }

  const cached = routeCache.get(validatedWallet);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return NextResponse.json(cached.data, {
      headers: {
        "Cache-Control": "private, max-age=30, stale-while-revalidate=30",
        "X-Cache": "HIT",
      },
    });
  }

  try {
    const data = await getMyListingsPageData(validatedWallet);
    routeCache.set(validatedWallet, {
      data,
      timestamp: Date.now(),
    });

    return NextResponse.json(data, {
      headers: {
        "Cache-Control": "private, max-age=30, stale-while-revalidate=30",
        "X-Cache": "MISS",
      },
    });
  } catch (error) {
    const message = error instanceof Error
      ? error.message
      : "Failed to fetch my listings";

    console.error("My listings API error:", error);

    return NextResponse.json(
      {
        error: message,
        ok: false,
      },
      { status: 500 },
    );
  }
}