import { NextRequest, NextResponse } from "next/server";
import { getOracleApiUrl } from "@/lib/server/oracle-env";

const ORACLE_API = getOracleApiUrl();
const TIMEOUT_MS = 45000;

export const maxDuration = 60;

type OracleTransaction = {
  date: string;
  price: number;
};

type OracleTransactionsResponse = {
  asset?: { id?: string | null } | null;
  count?: number;
  totalUnfiltered?: number;
  transactions?: OracleTransaction[];
};

type OracleAnalyticsPeriod = {
  averagePriceUsd: number | null;
  displayPriceUsd: number | null;
  hasAltValue: boolean;
  label: string;
  maxPriceUsd: number | null;
  minPriceUsd: number | null;
  periodStart: string;
  salesCount: number;
  salesVolumeUsd: number;
};

type OracleAnalyticsResponse = {
  altValueUsd: number | null;
  assetId: string | null;
  averageSalePriceUsd: number | null;
  cardName: string;
  coverageEnd: string | null;
  coverageStart: string | null;
  currentValueUsd: number | null;
  dataSource?: "sales" | "tcgplayer-market";
  empty: boolean;
  gradeFilter: string | null;
  latestAveragePriceUsd: number | null;
  marketValueUsd: number | null;
  maxPriceUsd: number | null;
  minPriceUsd: number | null;
  periods: OracleAnalyticsPeriod[];
  title: string;
  totalObservedSales: number;
  totalSales: number;
  totalVolumeUsd: number;
  valueSource: string | null;
};

type LegacyChartResolution = {
  altValueUsd: number | null;
  assetId: string | null;
  marketValueUsd: number | null;
  salesCount: number | null;
  valueSource: string | null;
};

type MonthlyBucket = {
  maxPriceUsd: number;
  minPriceUsd: number;
  prices: number[];
  salesCount: number;
  salesVolumeUsd: number;
};

async function fetchWithTimeout(url: string, options: RequestInit = {}, timeoutMs: number = TIMEOUT_MS): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    clearTimeout(timeoutId);
    return response;
  } catch (error) {
    clearTimeout(timeoutId);
    throw error;
  }
}

function roundCurrency(value: number): number {
  return Math.round(value * 100) / 100;
}

function buildAnalyticsPeriods(transactions: OracleTransaction[]): OracleAnalyticsPeriod[] {
  const monthly = new Map<string, MonthlyBucket>();

  for (const transaction of transactions) {
    const date = new Date(transaction.date);
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;

    if (!monthly.has(key)) {
      monthly.set(key, {
        minPriceUsd: transaction.price,
        maxPriceUsd: transaction.price,
        prices: [],
        salesCount: 0,
        salesVolumeUsd: 0,
      });
    }

    const bucket = monthly.get(key);
    if (!bucket) {
      continue;
    }

    bucket.prices.push(transaction.price);
    bucket.salesCount += 1;
    bucket.salesVolumeUsd += transaction.price;
    bucket.minPriceUsd = Math.min(bucket.minPriceUsd, transaction.price);
    bucket.maxPriceUsd = Math.max(bucket.maxPriceUsd, transaction.price);
  }

  return [...monthly.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([month, bucket]) => {
      const averagePriceUsd = bucket.prices.length > 0
        ? roundCurrency(bucket.prices.reduce((sum, price) => sum + price, 0) / bucket.prices.length)
        : null;
      const periodStart = `${month}-01`;
      const [year, monthNumber] = month.split("-");
      const labelDate = new Date(Number(year), Number(monthNumber) - 1, 1);

      return {
        averagePriceUsd,
        displayPriceUsd: averagePriceUsd,
        hasAltValue: false,
        label: labelDate.toLocaleDateString("en-US", { month: "short", year: "2-digit" }),
        maxPriceUsd: roundCurrency(bucket.maxPriceUsd),
        minPriceUsd: roundCurrency(bucket.minPriceUsd),
        periodStart,
        salesCount: bucket.salesCount,
        salesVolumeUsd: roundCurrency(bucket.salesVolumeUsd),
      };
    });
}

function buildLegacyAnalyticsResponse(
  payload: OracleTransactionsResponse,
  {
    altValueUsd,
    assetId,
    cardName,
    grade,
    marketValueUsd,
    valueSource,
  }: {
    altValueUsd?: number | null;
    assetId: string;
    cardName: string;
    grade: string | null;
    marketValueUsd?: number | null;
    valueSource?: string | null;
  },
): OracleAnalyticsResponse {
  const transactions = [...(payload.transactions || [])]
    .filter((transaction) => Number.isFinite(transaction.price) && Boolean(transaction.date))
    .sort((left, right) => new Date(left.date).getTime() - new Date(right.date).getTime());

  const periods = buildAnalyticsPeriods(transactions);
  const totalVolumeUsd = roundCurrency(transactions.reduce((sum, transaction) => sum + transaction.price, 0));
  const latestAveragePriceUsd = periods.length > 0 ? periods[periods.length - 1]?.averagePriceUsd ?? null : null;
  const minPriceUsd = transactions.length > 0
    ? roundCurrency(Math.min(...transactions.map((transaction) => transaction.price)))
    : null;
  const maxPriceUsd = transactions.length > 0
    ? roundCurrency(Math.max(...transactions.map((transaction) => transaction.price)))
    : null;
  const resolvedCardName = cardName || assetId;
  const resolvedMarketValueUsd = marketValueUsd ?? altValueUsd ?? null;
  const currentValueUsd = resolvedMarketValueUsd ?? latestAveragePriceUsd;

  return {
    altValueUsd: altValueUsd ?? null,
    assetId: payload.asset?.id || assetId,
    averageSalePriceUsd: transactions.length > 0 ? roundCurrency(totalVolumeUsd / transactions.length) : null,
    cardName: resolvedCardName,
    coverageEnd: transactions.length > 0 ? transactions[transactions.length - 1]?.date ?? null : null,
    coverageStart: transactions.length > 0 ? transactions[0]?.date ?? null : null,
    currentValueUsd,
    dataSource: "sales",
    empty: transactions.length === 0,
    gradeFilter: grade,
    latestAveragePriceUsd,
    marketValueUsd: resolvedMarketValueUsd,
    maxPriceUsd,
    minPriceUsd,
    periods,
    title: `${resolvedCardName}${grade ? ` | ${grade}` : ""}`,
    totalObservedSales: payload.totalUnfiltered || payload.count || transactions.length,
    totalSales: transactions.length,
    totalVolumeUsd,
    valueSource: valueSource ?? (resolvedMarketValueUsd !== null ? "legacy_chart_header" : null),
  };
}

function buildEmptyAnalyticsResponse(
  {
    assetId,
    cardName,
    grade,
  }: {
    assetId?: string | null;
    cardName: string;
    grade: string | null;
  },
): OracleAnalyticsResponse {
  const resolvedCardName = cardName || assetId || "Unknown Card";

  return {
    altValueUsd: null,
    assetId: assetId || null,
    averageSalePriceUsd: null,
    cardName: resolvedCardName,
    coverageEnd: null,
    coverageStart: null,
    currentValueUsd: null,
    dataSource: "sales",
    empty: true,
    gradeFilter: grade,
    latestAveragePriceUsd: null,
    marketValueUsd: null,
    maxPriceUsd: null,
    minPriceUsd: null,
    periods: [],
    title: `${resolvedCardName}${grade ? ` | ${grade}` : ""}`,
    totalObservedSales: 0,
    totalSales: 0,
    totalVolumeUsd: 0,
    valueSource: null,
  };
}

async function resolveLegacyChartAsset(searchParams: URLSearchParams): Promise<LegacyChartResolution | null> {
  const set = searchParams.get("set");
  const number = searchParams.get("number");
  const q = searchParams.get("q");
  const assetId = searchParams.get("assetId");
  const productId = searchParams.get("productId");
  const mint = searchParams.get("mint") || "";
  const category = searchParams.get("category") || "";
  const language = searchParams.get("language") || "";
  const variant = searchParams.get("variant") || "";
  const grade = searchParams.get("grade") || "";

  if (!set && !number && !q && !assetId) {
    return null;
  }

  const params = new URLSearchParams();
  if (set) params.set("set", set);
  if (number) params.set("number", number);
  if (q) params.set("q", q);
  if (assetId) params.set("assetId", assetId);
  if (productId) params.set("productId", productId);
  if (mint) params.set("mint", mint);
  if (category) params.set("category", category);
  if (language) params.set("language", language);
  if (variant) params.set("variant", variant);
  if (grade) params.set("grade", grade);

  const chartResponse = await fetchWithTimeout(
    `${ORACLE_API}/api/live/chart?${params.toString()}`,
    {},
    TIMEOUT_MS,
  );
  if (!chartResponse.ok) {
    return null;
  }

  const resolvedAssetId = chartResponse.headers.get("x-asset-id");
  const marketValueHeader = chartResponse.headers.get("x-market-value");
  const altValueHeader = chartResponse.headers.get("x-alt-value");
  const salesHeader = chartResponse.headers.get("x-total-sales") || chartResponse.headers.get("x-sales-count");
  const valueSource = chartResponse.headers.get("x-value-source");

  try {
    await chartResponse.body?.cancel();
  } catch {
    // Ignore body cancellation failures; headers are enough for fallback resolution.
  }

  return {
    altValueUsd: altValueHeader ? Number(altValueHeader) : null,
    assetId: resolvedAssetId,
    marketValueUsd: marketValueHeader ? Number(marketValueHeader) : null,
    salesCount: salesHeader ? Number(salesHeader) : null,
    valueSource,
  };
}

async function tryLegacyAnalyticsFallback(searchParams: URLSearchParams, response: Response): Promise<OracleAnalyticsResponse | null> {
  if (response.status !== 404) {
    return null;
  }

  const errorText = (await response.text()).trim();
  if (errorText && !/not found/i.test(errorText)) {
    return null;
  }

  const assetId = searchParams.get("assetId");
  const grade = searchParams.get("grade");
  const cardName = searchParams.get("q") || assetId || "Unknown Card";

  let resolvedAssetId = assetId;
  let resolvedAltValueUsd: number | null = null;
  let resolvedMarketValueUsd: number | null = null;
  let resolvedValueSource: string | null = null;

  if (!resolvedAssetId) {
    const chartResolution = await resolveLegacyChartAsset(searchParams);
    resolvedAssetId = chartResolution?.assetId || null;
    resolvedAltValueUsd = chartResolution?.altValueUsd ?? null;
    resolvedMarketValueUsd = chartResolution?.marketValueUsd ?? null;
    resolvedValueSource = chartResolution?.valueSource ?? null;
  }

  if (!resolvedAssetId) {
    return buildEmptyAnalyticsResponse({
      assetId: null,
      cardName,
      grade,
    });
  }

  const params = new URLSearchParams({ assetId: resolvedAssetId });
  if (grade) {
    params.set("grade", grade);
  }

  const transactionsResponse = await fetchWithTimeout(
    `${ORACLE_API}/api/live/transactions?${params.toString()}`,
    {},
    TIMEOUT_MS,
  );
  if (!transactionsResponse.ok) {
    return null;
  }

  const transactionsPayload = (await transactionsResponse.json()) as OracleTransactionsResponse;
  return buildLegacyAnalyticsResponse(transactionsPayload, {
    altValueUsd: resolvedAltValueUsd,
    assetId: resolvedAssetId,
    cardName,
    grade,
    marketValueUsd: resolvedMarketValueUsd,
    valueSource: resolvedValueSource,
  });
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const endpoint = searchParams.get("endpoint");

    if (!endpoint) {
      return NextResponse.json({ error: "Missing endpoint parameter" }, { status: 400 });
    }

    let url: string;
    let responseType: "json" | "image" = "json";

    // Route requests to appropriate oracle endpoints
    if (endpoint === "market-search") {
      const q = searchParams.get("q");
      if (!q) {
        return NextResponse.json({ error: "Missing query parameter" }, { status: 400 });
      }
      url = `${ORACLE_API}/api/market/prices?card=${encodeURIComponent(q)}&limit=1`;
    } else if (endpoint === "chart-id") {
      const name = searchParams.get("name") || "";
      const grade = searchParams.get("grade") || "";
      const nft = searchParams.get("nft") || "";
      const params = new URLSearchParams();
      if (name) params.set("name", name);
      if (grade) params.set("grade", grade);
      if (nft) params.set("nft", nft);
      url = `${ORACLE_API}/api/market/chart-id?${params.toString()}`;
    } else if (endpoint === "search") {
      const q = searchParams.get("q");
      if (!q) {
        return NextResponse.json({ error: "Missing query parameter" }, { status: 400 });
      }
      url = `${ORACLE_API}/api/live/search?q=${encodeURIComponent(q)}`;
    } else if (endpoint === "chart") {
      const set = searchParams.get("set");
      const number = searchParams.get("number");
      const q = searchParams.get("q");
      const productId = searchParams.get("productId") || "";
      const category = searchParams.get("category") || "";
      const language = searchParams.get("language") || "";
      const variant = searchParams.get("variant") || "";
      const grade = searchParams.get("grade") || "";

      const assetId = searchParams.get("assetId") || "";
      const mint = searchParams.get("mint") || "";

      const params = new URLSearchParams();
      if (set) params.set("set", set);
      if (number) params.set("number", number);
      if (q) params.set("q", q);
      if (assetId) params.set("assetId", assetId);
      if (productId) params.set("productId", productId);
      if (mint) params.set("mint", mint);
      if (category) params.set("category", category);
      if (language) params.set("language", language);
      if (variant) params.set("variant", variant);
      if (grade) params.set("grade", grade);

      if (!set && !number && !q && !assetId) {
        return NextResponse.json({ error: "Missing set+number, q, or assetId parameter" }, { status: 400 });
      }

      url = `${ORACLE_API}/api/live/chart?${params.toString()}`;
      responseType = "image";
    } else if (endpoint === "analytics") {
      const set = searchParams.get("set");
      const number = searchParams.get("number");
      const q = searchParams.get("q");
      const productId = searchParams.get("productId") || "";
      const category = searchParams.get("category") || "";
      const language = searchParams.get("language") || "";
      const variant = searchParams.get("variant") || "";
      const grade = searchParams.get("grade") || "";

      const assetId = searchParams.get("assetId") || "";
      const mint = searchParams.get("mint") || "";

      const params = new URLSearchParams();
      if (set) params.set("set", set);
      if (number) params.set("number", number);
      if (q) params.set("q", q);
      if (assetId) params.set("assetId", assetId);
      if (productId) params.set("productId", productId);
      if (mint) params.set("mint", mint);
      if (category) params.set("category", category);
      if (language) params.set("language", language);
      if (variant) params.set("variant", variant);
      if (grade) params.set("grade", grade);

      if (!set && !number && !q && !assetId) {
        return NextResponse.json({ error: "Missing set+number, q, or assetId parameter" }, { status: 400 });
      }

      url = `${ORACLE_API}/api/live/analytics?${params.toString()}`;
    } else if (endpoint === "transactions") {
      const assetId = searchParams.get("assetId");
      const grade = searchParams.get("grade") || "";

      if (!assetId) {
        return NextResponse.json({ error: "Missing assetId parameter" }, { status: 400 });
      }

      const params = new URLSearchParams({ assetId });
      if (grade) params.append("grade", grade);

      url = `${ORACLE_API}/api/live/transactions?${params.toString()}`;
    } else if (endpoint === "sealed") {
      const q = searchParams.get("q") || "";
      const tcg = searchParams.get("tcg") || "";
      const type = searchParams.get("type") || "";
      const params = new URLSearchParams();
      if (q) params.set("q", q);
      if (tcg) params.set("tcg", tcg);
      if (type) params.set("type", type);
      url = `${ORACLE_API}/api/tcgplayer/sealed?${params.toString()}`;
    } else if (endpoint === "ungraded") {
      const number = searchParams.get("number") || "";
      const ccName = searchParams.get("ccName") || "";
      const variant = searchParams.get("variant") || "";
      if (!number && !ccName) {
        return NextResponse.json({ error: "Missing number or ccName parameter" }, { status: 400 });
      }
      const params = new URLSearchParams();
      if (number) params.set("number", number);
      if (ccName) params.set("ccName", ccName);
      if (variant) params.set("variant", variant);
      url = `${ORACLE_API}/api/tcgplayer/ungraded?${params.toString()}`;
    } else if (endpoint === "valuate") {
      const name = searchParams.get("name") || "";
      const nft = searchParams.get("nft") || "";
      if (!name && !nft) {
        return NextResponse.json({ error: "Missing name or nft parameter" }, { status: 400 });
      }
      if (nft) {
        url = `${ORACLE_API}/api/live/valuate?nft=${encodeURIComponent(nft)}`;
      } else {
        url = `${ORACLE_API}/api/live/valuate?name=${encodeURIComponent(name)}`;
      }
    } else if (endpoint === "cert") {
      const cert = searchParams.get("cert") || "";
      if (!cert) {
        return NextResponse.json({ error: "Missing cert parameter" }, { status: 400 });
      }
      url = `${ORACLE_API}/api/cert/${encodeURIComponent(cert)}`;
    } else if (endpoint === "cert-cgc") {
      const cert = searchParams.get("cert") || "";
      const gradeParam = searchParams.get("grade") || "";
      if (!cert) {
        return NextResponse.json({ error: "Missing cert parameter" }, { status: 400 });
      }
      url = `${ORACLE_API}/api/cert/cgc/${encodeURIComponent(cert)}?grade=${encodeURIComponent(gradeParam)}`;
    } else {
      return NextResponse.json({ error: "Invalid endpoint" }, { status: 400 });
    }

    // Fetch from oracle
    const response = await fetchWithTimeout(url, {}, TIMEOUT_MS);

    if (!response.ok) {
      if (endpoint === "analytics") {
        const fallbackAnalytics = await tryLegacyAnalyticsFallback(searchParams, response.clone());
        if (fallbackAnalytics) {
          return NextResponse.json(fallbackAnalytics, {
            headers: {
              "Access-Control-Allow-Origin": "*",
              "Access-Control-Allow-Methods": "GET",
              "Cache-Control": "public, max-age=300",
              "X-Asset-Id": fallbackAnalytics.assetId || "",
              "X-Total-Sales": String(fallbackAnalytics.totalSales),
            },
          });
        }
      }

      const contentType = response.headers.get("content-type") || "";
      let errorMessage = `Oracle API error: ${response.statusText}`;

      try {
        if (contentType.includes("application/json")) {
          const payload = await response.json();
          errorMessage = payload?.error || payload?.message || errorMessage;
        } else {
          const text = await response.text();
          if (text) errorMessage = text.slice(0, 240);
        }
      } catch {}

      return NextResponse.json(
        { error: errorMessage },
        { status: response.status }
      );
    }

    // Handle different response types
    if (responseType === "image") {
      // Return image as PNG
      const buffer = await response.arrayBuffer();
      const totalSales = response.headers.get("x-total-sales");
      const assetId = response.headers.get("x-asset-id");
      const altValue = response.headers.get("x-alt-value");
      const headers: Record<string, string> = {
        "Content-Type": "image/png",
        "Cache-Control": "public, s-maxage=300, stale-while-revalidate=60",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET",
      };

      if (totalSales) {
        headers["X-Total-Sales"] = totalSales;
        headers["X-Sales-Count"] = totalSales;
      }
      if (assetId) headers["X-Asset-Id"] = assetId;
      if (altValue) headers["X-Alt-Value"] = altValue;

      return new NextResponse(buffer, {
        headers,
      });
    } else {
      // Return JSON
      const data = await response.json();
      return NextResponse.json(data, {
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET",
          "Cache-Control": "public, max-age=300",
        },
      });
    }
  } catch (error) {
    console.error("Oracle API error:", error);

    // Handle timeout errors gracefully
    if (error instanceof Error && error.name === "AbortError") {
      return NextResponse.json(
        { error: "Oracle API timeout - price data unavailable" },
        { status: 504 }
      );
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to fetch oracle data" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    new URL(req.url);

    await req.text()

    return NextResponse.json({ error: "Unknown POST endpoint" }, { status: 400 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "POST failed" },
      { status: 500 }
    );
  }
}

export async function OPTIONS() {
  return new NextResponse(null, {
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, X-API-Key",
    },
  });
}
