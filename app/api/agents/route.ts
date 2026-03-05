import { NextRequest, NextResponse } from "next/server";
import {
  registerAgentApiKey,
  getAllAgents,
  getAgentByWallet,
} from "@/app/lib/api-keys";

/**
 * POST /api/agents/register
 * Register a new agent with API key
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { walletAddress, agentName, apiKey, nftMint, permissions } = body;

    if (!walletAddress || !agentName || !apiKey || !nftMint) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    const record = registerAgentApiKey(
      walletAddress,
      agentName,
      apiKey,
      nftMint,
      permissions || { Trade: false, Bid: false, Chat: false }
    );

    return NextResponse.json(
      {
        success: true,
        agent: {
          walletAddress: record.walletAddress,
          agentName: record.agentName,
          nftMint: record.nftMint,
          permissions: record.permissions,
          createdAt: record.createdAt,
        },
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Failed to register agent:", error);
    return NextResponse.json(
      { error: "Failed to register agent" },
      { status: 500 }
    );
  }
}

/**
 * GET /api/agents
 * Get all agents (public view, no API keys exposed)
 */
export async function GET(req: NextRequest) {
  try {
    const agents = getAllAgents();

    return NextResponse.json({
      success: true,
      count: agents.length,
      agents,
    });
  } catch (error) {
    console.error("Failed to fetch agents:", error);
    return NextResponse.json(
      { error: "Failed to fetch agents" },
      { status: 500 }
    );
  }
}
