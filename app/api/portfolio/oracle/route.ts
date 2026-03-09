import { NextRequest, NextResponse } from "next/server";

/**
 * Oracle Market Valuation API Route
 * 
 * This route will eventually integrate with the Alt.xyz oracle for real-time
 * market pricing of collectible cards. Currently serves as a stub that:
 * - Accepts a list of card identifiers (name, set, grade)
 * - Returns oracle market prices when available
 * - Falls back to insured values during development
 * 
 * Production plan:
 * 1. Read price-history.json from artifacte-oracle at build time
 * 2. Create indexed lookup map by card identifiers
 * 3. Return market prices for matched cards
 * 4. Track confidence scores for each price point
 */

interface CardLookup {
  itemName: string;
  set: string;
  grade: string;
  gradingCompany: string;
}

interface OraclePrice {
  assetId: string;
  marketPrice: number;
  insuredValue: number;
  confidence: number;
  source: "oracle" | "insured";
  lastUpdated: number;
}

interface OracleResponse {
  ok: boolean;
  prices: Record<string, OraclePrice>;
  timestamp: number;
  message?: string;
}

/**
 * POST /api/portfolio/oracle
 * 
 * Request body:
 * {
 *   cards: [
 *     { itemName: "Charizard", set: "Base Set", grade: "10", gradingCompany: "PSA" },
 *     ...
 *   ]
 * }
 * 
 * Response:
 * {
 *   ok: true,
 *   prices: {
 *     "cardId": {
 *       assetId: "...",
 *       marketPrice: 15000,
 *       insuredValue: 12000,
 *       confidence: 0.95,
 *       source: "oracle",
 *       lastUpdated: 1234567890
 *     },
 *     ...
 *   },
 *   timestamp: 1234567890,
 *   message: "Oracle pricing coming soon — using insured values"
 * }
 */

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const body = await req.json();
    const { cards } = body as { cards: CardLookup[] };

    if (!cards || !Array.isArray(cards)) {
      return NextResponse.json(
        { ok: false, error: "Missing or invalid cards array" },
        { status: 400 }
      );
    }

    // TODO: Load price-history.json at build time
    // const priceData = require('@/data/oracle-prices.json');
    // const assetIndex = buildAssetIndex(priceData);

    // For now: Return stub response indicating oracle is coming soon
    const response: OracleResponse = {
      ok: true,
      prices: {},
      timestamp: Date.now(),
      message:
        "Oracle market pricing is coming soon. Currently showing Collector Crypt insured valuations as placeholder.",
    };

    // Create stub entries for each card
    cards.forEach((card, index) => {
      const cardKey = `${card.itemName}-${card.set}-${card.grade}`;
      response.prices[cardKey] = {
        assetId: "",
        marketPrice: 0,
        insuredValue: 0,
        confidence: 0,
        source: "insured",
        lastUpdated: Date.now(),
      };
    });

    return NextResponse.json(response, {
      headers: {
        "Cache-Control": "public, max-age=600",
      },
    });
  } catch (error: any) {
    console.error("Oracle API error:", error);

    return NextResponse.json(
      {
        ok: false,
        error:
          error.message ||
          "Failed to fetch oracle pricing. Using insured values.",
      },
      { status: 500 }
    );
  }
}

/**
 * GET /api/portfolio/oracle?cards=Charizard,Base%20Set,10,PSA&cards=...
 *
 * Query param: cards (repeatable)
 * Format: itemName,set,grade,gradingCompany
 *
 * Returns same OracleResponse structure
 */

export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
    const { searchParams } = new URL(req.url);
    const cardParams = searchParams.getAll("cards");

    if (!cardParams || cardParams.length === 0) {
      return NextResponse.json(
        { ok: false, error: "Missing cards parameter" },
        { status: 400 }
      );
    }

    const cards: CardLookup[] = cardParams.map((param) => {
      const [itemName, set, grade, gradingCompany] = param.split(",");
      return { itemName, set, grade, gradingCompany };
    });

    // TODO: Implement oracle lookup
    // For now: Return stub

    const response: OracleResponse = {
      ok: true,
      prices: {},
      timestamp: Date.now(),
      message:
        "Oracle market pricing is coming soon. Currently showing Collector Crypt insured valuations as placeholder.",
    };

    cards.forEach((card) => {
      const cardKey = `${card.itemName}-${card.set}-${card.grade}`;
      response.prices[cardKey] = {
        assetId: "",
        marketPrice: 0,
        insuredValue: 0,
        confidence: 0,
        source: "insured",
        lastUpdated: Date.now(),
      };
    });

    return NextResponse.json(response, {
      headers: {
        "Cache-Control": "public, max-age=600",
      },
    });
  } catch (error: any) {
    console.error("Oracle API error:", error);

    return NextResponse.json(
      { ok: false, error: error.message || "Failed to fetch oracle pricing" },
      { status: 500 }
    );
  }
}
