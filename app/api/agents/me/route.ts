import { NextRequest, NextResponse } from "next/server"

import { getOwnerAgentByWallet } from "@/app/lib/api-keys"
import {
  assertSignedAgentOwnerRequest,
  toAgentOwnerRequestErrorResponse,
} from "@/lib/server/agent-owner-request"

export async function GET(request: NextRequest) {
  try {
    const context = await assertSignedAgentOwnerRequest(request)
    const assetAddress = request.nextUrl.searchParams.get("assetAddress")?.trim()
    const agent = getOwnerAgentByWallet(context.walletAddress)

    if (!agent) {
      return NextResponse.json({ error: "Agent not found" }, { status: 404 })
    }

    if (assetAddress && agent.agentAssetAddress !== assetAddress) {
      return NextResponse.json({ error: "Agent not found" }, { status: 404 })
    }

    return NextResponse.json({
      success: true,
      agent,
    })
  } catch (error) {
    return toAgentOwnerRequestErrorResponse(error as Error, "Failed to fetch agent")
  }
}