import { NextRequest, NextResponse } from "next/server";
import { getTypedBudgetStatus } from "@/app/lib/api-keys";
import {
  assertSignedAgentOwnerRequest,
  toAgentOwnerRequestErrorResponse,
} from "@/lib/server/agent-owner-request";

/**
 * GET /api/agents/budget?address=<wallet_address>
 * Get current budget status for an agent
 */
export async function GET(req: NextRequest) {
  try {
    const context = await assertSignedAgentOwnerRequest(req)
    const searchParams = req.nextUrl.searchParams;
    const address = searchParams.get("address")?.trim() || context.walletAddress;

    if (address !== context.walletAddress) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 })
    }

    const status = getTypedBudgetStatus(address);

    if (!status) {
      return NextResponse.json(
        { error: "Agent not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      address,
      ...status,
    });
  } catch (error) {
    console.error("Failed to get budget status:", error);
    return toAgentOwnerRequestErrorResponse(error as Error, "Failed to get budget status")
  }
}
