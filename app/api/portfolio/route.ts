import { NextRequest, NextResponse } from "next/server";
import type { PortfolioApiResponse, PortfolioPageData } from "@/lib/portfolio";
import { getPortfolioPageData, validatePortfolioWallet } from "@/lib/server/portfolio";

const portfolioCache = new Map<
  string,
  { data: PortfolioPageData; timestamp: number }
>();

const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

function isPrerenderInterruption(error: Error & { digest?: string }): boolean {
  return (
    error.digest === "NEXT_PRERENDER_INTERRUPTED" ||
    error.message.includes("needs to bail out of prerendering")
  );
}

export async function GET(
  req: NextRequest
): Promise<NextResponse<PortfolioApiResponse>> {
  try {
    const searchParams = req.nextUrl.searchParams;
    const wallet = searchParams.get("wallet");

    if (!wallet) {
      return NextResponse.json(
        { error: "Missing wallet parameter", ok: false },
        { status: 400 }
      );
    }

    let validatedWallet: string;

    try {
      validatedWallet = validatePortfolioWallet(wallet);
    } catch {
      return NextResponse.json(
        { error: "Invalid wallet address format", ok: false },
        { status: 400 }
      );
    }

    // Check cache
    const cached = portfolioCache.get(validatedWallet);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      return NextResponse.json(cached.data, {
        headers: {
          "Cache-Control": "public, max-age=300, stale-while-revalidate=60",
          "X-Cache": "HIT",
        },
      });
    }

    const portfolioData = await getPortfolioPageData(validatedWallet);

    // Store in cache
    portfolioCache.set(validatedWallet, {
      data: portfolioData,
      timestamp: Date.now(),
    });

    return NextResponse.json(portfolioData, {
      headers: {
        "Cache-Control": "public, max-age=300, stale-while-revalidate=60",
        "X-Cache": "MISS",
      },
    });
  } catch (error) {
    if (error instanceof Error && isPrerenderInterruption(error as Error & { digest?: string })) {
      throw error;
    }

    const message = error instanceof Error
      ? error.message
      : "Failed to fetch portfolio data from Collector Crypt";

    console.error("Portfolio API error:", error);

    return NextResponse.json(
      {
        ok: false,
        error: message,
      },
      { status: 500 }
    );
  }
}
