import { NextRequest, NextResponse } from "next/server";
import { verifyApiKey, updateConnectionStatus } from "@/app/lib/api-keys";

/**
 * POST /api/agents/verify
 * Verify an API key and return agent info
 * Used by MCP server for authentication
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { apiKey } = body;

    if (!apiKey) {
      return NextResponse.json(
        { error: "Missing API key" },
        { status: 400 }
      );
    }

    const agentInfo = verifyApiKey(apiKey);

    if (!agentInfo) {
      return NextResponse.json(
        { error: "Invalid API key" },
        { status: 401 }
      );
    }

    // Update connection status to connected
    updateConnectionStatus(apiKey, "connected");

    return NextResponse.json({
      success: true,
      agent: {
        walletAddress: agentInfo.walletAddress,
        agentName: agentInfo.agentName,
        nftMint: agentInfo.nftMint,
        permissions: agentInfo.permissions,
        connectionStatus: "connected",
      },
    });
  } catch (error) {
    console.error("Failed to verify API key:", error);
    return NextResponse.json(
      { error: "Failed to verify API key" },
      { status: 500 }
    );
  }
}
