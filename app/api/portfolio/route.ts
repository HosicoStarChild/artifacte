import { NextRequest, NextResponse } from "next/server";
import type { PortfolioApiResponse } from "@/lib/portfolio";
import { getPortfolioPageData, validatePortfolioWallet } from "@/lib/server/portfolio";

export const dynamic = "force-dynamic";
export const revalidate = 0;

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

    const portfolioData = await getPortfolioPageData(validatedWallet);

    return NextResponse.json(portfolioData, {
      headers: {
        "Cache-Control": "private, no-store",
        "X-Cache": "LIVE",
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
