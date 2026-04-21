import { NextRequest, NextResponse } from "next/server";
import { getOracleApiUrl } from "@/lib/server/oracle-env";

/**
 * Portfolio API Route
 *
 * Fetches portfolio data from Collector Crypt API and transforms it
 * with additional metrics and analysis.
 *
 * Currently shows Collector Crypt insured valuations with oracle sold-comp enrichment
 * fetched directly from the configured oracle service.
 */

interface CCCard {
  itemName: string;
  grade: string;
  gradeNum: number;
  gradingCompany: string;
  insuredValue: string;
  nftAddress: string;
  frontImage: string;
  category: string;
  vault: string;
  year: number;
  set: string;
  listing: {
    price: number;
    currency: string;
    marketplace: string;
  } | null;
}

interface CCResponse {
  findTotal: number;
  cardsQtyByCategory: Record<string, number>;
  filterNFtCard: CCCard[];
}

interface PortfolioCard extends CCCard {
  insuredValueNum: number;
  altAssetId?: string;
  altResearchUrl?: string;
}

interface PortfolioResponse {
  ok: boolean;
  wallet: string;
  timestamp: number;
  totalCards: number;
  totalInsuredValue: number;
  cards: PortfolioCard[];
  categoriesByValue: Record<string, number>;
  gradeDistribution: Record<string, number>;
  listedCards: number;
  unlistedCards: number;
  totalListedValue: number;
  marketCategoriesByValue?: Record<string, number>;
  error?: string;
}

const ORACLE_API = getOracleApiUrl();

// Load oracle lookup (ccName uppercase -> altAssetId)
import { readFileSync, existsSync } from "fs";
import { join } from "path";

let oracleLookup: Record<string, string> = {};
try {
  const lookupPath = join(process.cwd(), "data", "oracle-lookup.json");
  if (existsSync(lookupPath)) {
    oracleLookup = JSON.parse(readFileSync(lookupPath, "utf8"));
  }
} catch {
  // Oracle lookup not available
}

// Simple in-memory cache with 5-minute TTL
const portfolioCache = new Map<
  string,
  { data: PortfolioResponse; timestamp: number }
>();

const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

async function fetchFromCollectorCrypt(wallet: string): Promise<CCResponse> {
  const url = `https://api.collectorcrypt.com/marketplace?ownerAddress=${wallet}`;

  const response = await fetch(url, {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
      "User-Agent": "Artifacte-Portfolio/1.0",
    },
  });

  if (!response.ok) {
    throw new Error(
      `Collector Crypt API error: ${response.status} ${response.statusText}`
    );
  }

  return response.json();
}

async function transformCCData(data: CCResponse, wallet: string): Promise<PortfolioResponse> {
  const cards: PortfolioCard[] = (data.filterNFtCard || []).map((card) => {
    const nameKey = (card.itemName || "").toUpperCase().trim();
    const altAssetId = oracleLookup[nameKey] || undefined;
    return {
      ...card,
      insuredValueNum: parseFloat(card.insuredValue || "0"),
      altAssetId,
      altResearchUrl: altAssetId ? `https://alt.xyz/itm/${altAssetId}/research` : undefined,
    };
  });

  // Fetch market prices from oracle (sold comps) for all portfolio NFTs
  let marketPriceMap: Record<string, { price: number; source: string }> = {};
  try {
    const nftAddresses = cards.map(c => c.nftAddress).filter(Boolean);
    const cardNames = cards.map(c => c.itemName || '');
    if (nftAddresses.length > 0) {
      const res = await fetch(
        `${ORACLE_API}/api/market/portfolio?nfts=${nftAddresses.join(',')}&names=${encodeURIComponent(cardNames.join('||'))}`,
        { signal: AbortSignal.timeout(10000) }
      );
      if (res.ok) {
        const data = await res.json();
        Object.entries(data.values || {}).forEach(([nft, v]: [string, any]) => {
          marketPriceMap[nft] = { price: v.marketValue, source: v.source };
        });
      }
    }
  } catch {
    // Oracle lookup failed — continue without market prices
  }

  // Attach oracle market value to each card
  const enrichedCards = cards.map(card => ({
    ...card,
    oracleValue: marketPriceMap[card.nftAddress]?.price || null,
    oracleSource: marketPriceMap[card.nftAddress]?.source || null,
  }));

  // Calculate totals
  const totalInsuredValue = cards.reduce(
    (sum, card) => sum + card.insuredValueNum,
    0
  );
  const listedCards = cards.filter((card) => card.listing !== null).length;
  const unlistedCards = cards.length - listedCards;

  // Market value: use oracle sold comps, fall back to insured value
  let totalMarketValue = 0;
  const marketCategoriesByValue: Record<string, number> = {};
  cards.forEach((card) => {
    const market = marketPriceMap[card.nftAddress];
    const value = market ? market.price : card.insuredValueNum;
    totalMarketValue += value;
    const cat = card.category || 'Other';
    marketCategoriesByValue[cat] = (marketCategoriesByValue[cat] || 0) + value;
  });

  const totalListedValue = totalMarketValue;

  // Group by category for value distribution
  const categoriesByValue: Record<string, number> = {};
  cards.forEach((card) => {
    const category = card.category || "Other";
    categoriesByValue[category] =
      (categoriesByValue[category] || 0) + card.insuredValueNum;
  });

  // Grade distribution
  const gradeDistribution: Record<string, number> = {};
  cards.forEach((card) => {
    const gradeKey = `${card.gradingCompany}-${card.grade}`;
    gradeDistribution[gradeKey] =
      (gradeDistribution[gradeKey] || 0) + 1;
  });

  return {
    ok: true,
    wallet,
    timestamp: Date.now(),
    totalCards: cards.length,
    totalInsuredValue,
    cards: enrichedCards.sort((a, b) => b.insuredValueNum - a.insuredValueNum),
    categoriesByValue,
    gradeDistribution,
    listedCards,
    unlistedCards,
    totalListedValue,
    marketCategoriesByValue,
  };
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
    const { searchParams } = new URL(req.url);
    const wallet = searchParams.get("wallet");

    if (!wallet) {
      return NextResponse.json(
        { error: "Missing wallet parameter", ok: false },
        { status: 400 }
      );
    }

    // Validate Solana address format (basic check)
    if (wallet.length < 32 || wallet.length > 44) {
      return NextResponse.json(
        { error: "Invalid wallet address format", ok: false },
        { status: 400 }
      );
    }

    // Check cache
    const cached = portfolioCache.get(wallet);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      return NextResponse.json(cached.data, {
        headers: {
          "Cache-Control": "public, max-age=300",
          "X-Cache": "HIT",
        },
      });
    }

    // Fetch fresh data from Collector Crypt
    const ccData = await fetchFromCollectorCrypt(wallet);
    const portfolioData = await transformCCData(ccData, wallet);

    // Store in cache
    portfolioCache.set(wallet, {
      data: portfolioData,
      timestamp: Date.now(),
    });

    return NextResponse.json(portfolioData, {
      headers: {
        "Cache-Control": "public, max-age=300",
        "X-Cache": "MISS",
      },
    });
  } catch (error: any) {
    console.error("Portfolio API error:", error);

    return NextResponse.json(
      {
        ok: false,
        error:
          error.message ||
          "Failed to fetch portfolio data from Collector Crypt",
      },
      { status: 500 }
    );
  }
}
