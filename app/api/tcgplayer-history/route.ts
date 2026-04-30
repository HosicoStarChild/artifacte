import { NextRequest, NextResponse } from "next/server";

import { jsonError, withRequestTimeout } from "@/app/api/_lib/list-route-utils";
import { getOracleApiUrl } from "@/lib/server/oracle-env";

const ORACLE_API = getOracleApiUrl();

function parseProductId(value: string | null): string {
  if (!value || !/^\d{1,18}$/.test(value)) {
    throw new Error("Missing or invalid product id.");
  }

  return value;
}

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;

  try {
    const productId = parseProductId(searchParams.get("id"));
    const response = await fetch(
      `${ORACLE_API}/api/tcgplayer/index/card/${productId}`,
      { signal: withRequestTimeout(15000), cache: "no-store" },
    );

    if (!response.ok) {
      if (response.status === 404) {
        return jsonError("TCGplayer history not found.", 404);
      }

      return jsonError("TCGplayer history API error.", 502);
    }

    const payload = await response.json();

    return NextResponse.json(payload, {
      headers: { "Cache-Control": "public, max-age=900" },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to fetch TCGplayer history.";
    return jsonError(message, 400);
  }
}