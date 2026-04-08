import { NextRequest, NextResponse } from "next/server";
import { getBudgetStatus } from "@/app/lib/api-keys";

export const dynamic = 'force-dynamic';

/**
 * GET /api/agents/budget?address=<wallet_address>
 * Get current budget status for an agent
 */
export async function GET(req: NextRequest) {
  try {
    const searchParams = req.nextUrl.searchParams;
    const address = searchParams.get("address");

    if (!address) {
      return NextResponse.json(
        { error: "Missing address parameter" },
        { status: 400 }
      );
    }

    const status = getBudgetStatus(address);

    if (!status) {
      return NextResponse.json(
        { error: "Agent not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      address,
      limits: status.limits,
      progress: status.progress,
    });
  } catch (error) {
    console.error("Failed to get budget status:", error);
    return NextResponse.json(
      { error: "Failed to get budget status" },
      { status: 500 }
    );
  }
}
