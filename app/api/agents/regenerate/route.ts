import { NextRequest, NextResponse } from "next/server";
import { regenerateApiKey } from "@/app/lib/api-keys";

/**
 * POST /api/agents/regenerate
 * Regenerate API key for an agent
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { walletAddress } = body;

    if (!walletAddress) {
      return NextResponse.json(
        { error: "Missing wallet address" },
        { status: 400 }
      );
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
        walletAddress: newRecord.walletAddress,
        agentName: newRecord.agentName,
        nftMint: newRecord.nftMint,
        permissions: newRecord.permissions,
        connectionStatus: newRecord.connectionStatus,
      },
    });
  } catch (error) {
    console.error("Failed to regenerate API key:", error);
    return NextResponse.json(
      { error: "Failed to regenerate API key" },
      { status: 500 }
    );
  }
}
