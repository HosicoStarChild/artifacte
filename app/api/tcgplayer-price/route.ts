import { NextRequest, NextResponse } from "next/server";

import { jsonError, withRequestTimeout } from "@/app/api/_lib/list-route-utils";

type TcgPlayerPricePoint = {
  condition?: string | null;
  listedMedianPrice?: number | null;
  marketPrice?: number | null;
  printingType?: string | null;
};

function parseProductId(value: string | null): string {
  if (!value || !/^\d{1,18}$/.test(value)) {
    throw new Error("Missing or invalid product id.");
  }

  return value;
}

function selectBestPricePoint(pricePoints: readonly TcgPlayerPricePoint[]): TcgPlayerPricePoint | null {
  if (pricePoints.length === 0) {
    return null;
  }

  const nearMintFoil = pricePoints.find((pricePoint) => pricePoint.printingType === "Foil" && pricePoint.condition === "Near Mint");
  const nearMintNormal = pricePoints.find((pricePoint) => pricePoint.printingType === "Normal" && pricePoint.condition === "Near Mint");
  const anyFoil = pricePoints.find((pricePoint) => pricePoint.printingType === "Foil");

  return nearMintFoil || nearMintNormal || anyFoil || pricePoints[0] || null;
}

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;

  try {
    const productId = parseProductId(searchParams.get("id"));
    const response = await fetch(
      `https://mpapi.tcgplayer.com/v2/product/${productId}/pricepoints`,
      { signal: withRequestTimeout(8000), cache: "no-store" },
    );

    if (!response.ok) {
      return jsonError("TCGplayer API error.", 502);
    }

    const payload = (await response.json()) as TcgPlayerPricePoint[];
    const pricePoints = Array.isArray(payload) ? payload : [];
    const bestPricePoint = selectBestPricePoint(pricePoints);

    return NextResponse.json({
      productId,
      marketPrice: bestPricePoint?.marketPrice || null,
      listedMedianPrice: bestPricePoint?.listedMedianPrice || null,
      printingType: bestPricePoint?.printingType || null,
      condition: bestPricePoint?.condition || null,
    }, {
      headers: { "Cache-Control": "public, max-age=900" },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to fetch TCGplayer prices.";
    return jsonError(message, 400);
  }
}
