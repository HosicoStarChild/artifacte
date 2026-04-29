import { NextRequest, NextResponse } from "next/server";

import { getRpcFetchErrorStatus } from "@/app/api/_lib/list-route-utils";
import type { MyListingsApiResponse } from "@/lib/my-listings";
import { getMyListingsPageData, validateMyListingsWallet } from "@/lib/server/my-listings";

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

  try {
    const data = await getMyListingsPageData(validatedWallet);

    return NextResponse.json(data, {
      headers: {
        "Cache-Control": "private, no-store",
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
      {
        headers: {
          "Cache-Control": "private, no-store",
        },
        status: getRpcFetchErrorStatus(error),
      },
    );
  }
}