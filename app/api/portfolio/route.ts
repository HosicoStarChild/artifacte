import { NextRequest, NextResponse } from "next/server";

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
  error?: string;
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

function transformCCData(data: CCResponse, wallet: string): PortfolioResponse {
  const cards: PortfolioCard[] = (data.filterNFtCard || []).map((card) => ({
    ...card,
    insuredValueNum: parseFloat(card.insuredValue || "0"),
  }));

  // Calculate totals
  const totalInsuredValue = cards.reduce(
    (sum, card) => sum + card.insuredValueNum,
    0
  );
  const listedCards = cards.filter((card) => card.listing !== null).length;
  const unlistedCards = cards.length - listedCards;
  const totalListedValue = cards
    .filter((card) => card.listing !== null)
    .reduce((sum, card) => sum + (card.listing?.price || 0), 0);

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
    cards: cards.sort((a, b) => b.insuredValueNum - a.insuredValueNum),
    categoriesByValue,
    gradeDistribution,
    listedCards,
    unlistedCards,
    totalListedValue,
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
    const portfolioData = transformCCData(ccData, wallet);

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
