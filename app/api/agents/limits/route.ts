import { NextRequest, NextResponse } from "next/server";
import { updateSpendingLimits, SpendingLimits } from "@/app/lib/api-keys";

/**
 * POST /api/agents/limits
 * Update spending limits for an agent (requires wallet signature or API key)
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { walletAddress, spendingLimits } = body;

    if (!walletAddress || !spendingLimits) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    // Validate spending limits structure
    const limits = spendingLimits as SpendingLimits;
    if (!limits.daily || !limits.weekly || !limits.monthly) {
      return NextResponse.json(
        { error: "Invalid spending limits structure" },
        { status: 400 }
      );
    }

    const updated = updateSpendingLimits(walletAddress, limits);

    if (!updated) {
      return NextResponse.json(
        { error: "Agent not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      agent: {
        walletAddress: updated.walletAddress,
        agentName: updated.agentName,
        spendingLimits: updated.spendingLimits,
      },
    });
  } catch (error) {
    console.error("Failed to update spending limits:", error);
    return NextResponse.json(
      { error: "Failed to update spending limits" },
      { status: 500 }
    );
  }
}
