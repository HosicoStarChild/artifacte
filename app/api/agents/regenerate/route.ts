import { NextRequest, NextResponse } from "next/server";
import { regenerateApiKey } from "@/app/lib/api-keys";
import {
  readSignedAgentOwnerJson,
  toAgentOwnerRequestErrorResponse,
} from "@/lib/server/agent-owner-request";

interface RegenerateApiKeyRequestBody {
  walletAddress: string
}

/**
 * POST /api/agents/regenerate
 * Regenerate API key for an agent
 */
export async function POST(req: NextRequest) {
  try {
    const { body, context } =
      await readSignedAgentOwnerJson<RegenerateApiKeyRequestBody>(req)
    const { walletAddress } = body;

    if (!walletAddress) {
      return NextResponse.json(
        { error: "Missing wallet address" },
        { status: 400 }
      );
    }

    if (walletAddress !== context.walletAddress) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 })
    }

    const newRecord = regenerateApiKey(walletAddress);

    if (!newRecord) {
      return NextResponse.json(
        { error: "Agent not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      agent: {
        apiKey: newRecord.apiKey,
        walletAddress: newRecord.walletAddress,
        agentName: newRecord.agentName,
        nftMint: newRecord.nftMint,
        agentAssetAddress: newRecord.agentAssetAddress,
        categories: newRecord.categories,
        permissions: newRecord.permissions,
        connectionStatus: newRecord.connectionStatus,
        spendingLimits: newRecord.spendingLimits,
      },
    });
  } catch (error) {
    console.error("Failed to regenerate API key:", error);
    return toAgentOwnerRequestErrorResponse(error as Error, "Failed to regenerate API key")
  }
}
