export interface TcgPlayerPricePoint {
  condition?: string | null;
  listedMedianPrice?: number | null;
  marketPrice?: number | null;
  printingType?: string | null;
}

export interface TcgPlayerProductPrice {
  condition: string | null;
  listedMedianPrice: number | null;
  marketPrice: number | null;
  printingType: string | null;
  productId: string;
}

interface FetchTcgPlayerProductPriceOptions {
  cache?: RequestInit["cache"];
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

export function parseTcgPlayerProductId(value: string | null | undefined): string {
  if (!value || !/^\d{1,18}$/.test(value)) {
    throw new Error("Missing or invalid product id.");
  }

  return value;
}

export function selectBestTcgPlayerPricePoint(
  pricePoints: readonly TcgPlayerPricePoint[]
): TcgPlayerPricePoint | null {
  if (pricePoints.length === 0) {
    return null;
  }

  const nearMintFoil = pricePoints.find(
    (pricePoint) => pricePoint.printingType === "Foil" && pricePoint.condition === "Near Mint"
  );
  const nearMintNormal = pricePoints.find(
    (pricePoint) => pricePoint.printingType === "Normal" && pricePoint.condition === "Near Mint"
  );
  const anyFoil = pricePoints.find((pricePoint) => pricePoint.printingType === "Foil");

  return nearMintFoil || nearMintNormal || anyFoil || pricePoints[0] || null;
}

export function resolveTcgPlayerPriceValue(price: {
  listedMedianPrice?: number | null;
  marketPrice?: number | null;
}): number | null {
  if (typeof price.marketPrice === "number" && Number.isFinite(price.marketPrice) && price.marketPrice > 0) {
    return price.marketPrice;
  }

  if (
    typeof price.listedMedianPrice === "number"
    && Number.isFinite(price.listedMedianPrice)
    && price.listedMedianPrice > 0
  ) {
    return price.listedMedianPrice;
  }

  return null;
}

export async function fetchTcgPlayerProductPrice(
  productId: string,
  {
    cache = "no-store",
    fetchImpl = fetch,
    timeoutMs = 8_000,
  }: FetchTcgPlayerProductPriceOptions = {}
): Promise<TcgPlayerProductPrice> {
  const resolvedProductId = parseTcgPlayerProductId(productId);
  const response = await fetchImpl(
    `https://mpapi.tcgplayer.com/v2/product/${resolvedProductId}/pricepoints`,
    {
      cache,
      signal: AbortSignal.timeout(timeoutMs),
    }
  );

  if (!response.ok) {
    throw new Error("TCGplayer API error.");
  }

  const payload = (await response.json()) as TcgPlayerPricePoint[];
  const pricePoints = Array.isArray(payload) ? payload : [];
  const bestPricePoint = selectBestTcgPlayerPricePoint(pricePoints);

  return {
    condition: bestPricePoint?.condition || null,
    listedMedianPrice: bestPricePoint?.listedMedianPrice || null,
    marketPrice: bestPricePoint?.marketPrice || null,
    printingType: bestPricePoint?.printingType || null,
    productId: resolvedProductId,
  };
}