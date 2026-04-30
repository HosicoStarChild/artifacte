import { NextRequest, NextResponse } from "next/server";

import { jsonError } from "@/app/api/_lib/list-route-utils";
import { fetchTcgPlayerProductPrice, parseTcgPlayerProductId } from "@/lib/server/tcgplayer-price";

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;

  try {
    const productId = parseTcgPlayerProductId(searchParams.get("id"));
    const price = await fetchTcgPlayerProductPrice(productId, {
      cache: "no-store",
      timeoutMs: 8_000,
    });

    return NextResponse.json({
      productId: price.productId,
      marketPrice: price.marketPrice,
      listedMedianPrice: price.listedMedianPrice,
      printingType: price.printingType,
      condition: price.condition,
    }, {
      headers: { "Cache-Control": "public, max-age=900" },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to fetch TCGplayer prices.";
    return jsonError(message, 400);
  }
}
