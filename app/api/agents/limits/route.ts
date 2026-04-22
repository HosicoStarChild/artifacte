import { NextRequest, NextResponse } from "next/server";
import { updateSpendingLimits, SpendingLimits } from "@/app/lib/api-keys";
import {
  readSignedAgentOwnerJson,
  toAgentOwnerRequestErrorResponse,
} from "@/lib/server/agent-owner-request";

interface UpdateLimitsRequestBody {
  walletAddress: string
  spendingLimits: SpendingLimits
}

function hasValidSpendingLimits(value: SpendingLimits): boolean {
  return [value.daily, value.weekly, value.monthly].every(
    (limit) =>
      Number.isFinite(limit.limit) &&
      Number.isFinite(limit.spent) &&
      Number.isFinite(limit.resetAt)
  )
}

/**
 * POST /api/agents/limits
 * Update spending limits for an agent (requires wallet signature or API key)
 */
export async function POST(req: NextRequest) {
  try {
    const { body, context } =
      await readSignedAgentOwnerJson<UpdateLimitsRequestBody>(req)
    const { walletAddress, spendingLimits } = body;

    if (!walletAddress || !spendingLimits) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    if (walletAddress !== context.walletAddress) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 })
    }

    if (!spendingLimits.daily || !spendingLimits.weekly || !spendingLimits.monthly) {
      return NextResponse.json(
        { error: "Invalid spending limits structure" },
        { status: 400 }
      );
    }

    if (!hasValidSpendingLimits(spendingLimits)) {
      return NextResponse.json(
        { error: "Invalid spending limits values" },
        { status: 400 }
      )
    }

    const updated = updateSpendingLimits(walletAddress, spendingLimits);

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
    return toAgentOwnerRequestErrorResponse(error as Error, "Failed to update spending limits")
  }
}
