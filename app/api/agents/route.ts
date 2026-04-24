import { NextRequest, NextResponse } from "next/server";
import {
  generateApiKey,
  getPublicAgents,
  registerAgentApiKey,
  SpendingLimits,
} from "@/app/lib/api-keys";
import {
  normalizeAgentCategories,
  normalizeAgentPermissions,
  normalizeAgentServices,
  type AgentService,
} from "@/lib/agents";
import {
  readSignedAgentOwnerJson,
  toAgentOwnerRequestErrorResponse,
} from "@/lib/server/agent-owner-request";

interface CreateAgentRequestBody {
  walletAddress: string
  agentName: string
  nftMint?: string
  agentAssetAddress?: string
  categories?: string[]
  description?: string
  imageUri?: string
  permissions?: {
    Trade?: boolean
    Bid?: boolean
    Chat?: boolean
  }
  saidVerified?: boolean
  services?: AgentService[]
  spendingLimits?: SpendingLimits
}

function hasValidSpendingLimits(
  value?: SpendingLimits
): value is SpendingLimits {
  if (!value) {
    return false
  }

  return [value.daily, value.weekly, value.monthly].every(
    (limit) =>
      Number.isFinite(limit.limit) &&
      Number.isFinite(limit.spent) &&
      Number.isFinite(limit.resetAt)
  )
}

/**
 * POST /api/agents
 * Register a new agent with API key
 */
export async function POST(req: NextRequest) {
  try {
    const { body, context } = await readSignedAgentOwnerJson<CreateAgentRequestBody>(req)
    const {
      walletAddress,
      agentName,
      nftMint,
      agentAssetAddress,
      categories = [],
      description,
      imageUri,
      permissions,
      saidVerified,
      services,
      spendingLimits,
    } = body

    const normalizedAssetAddress = agentAssetAddress?.trim() || undefined
    const normalizedNftMint =
      nftMint?.trim() || normalizedAssetAddress || walletAddress

    if (!walletAddress || !agentName?.trim() || !normalizedNftMint) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    if (walletAddress !== context.walletAddress) {
      return NextResponse.json(
        { error: "Wallet signature does not match request body" },
        { status: 403 }
      )
    }

    if (spendingLimits && !hasValidSpendingLimits(spendingLimits)) {
      return NextResponse.json(
        { error: "Invalid spending limits" },
        { status: 400 }
      )
    }

    const apiKey = generateApiKey()

    const record = registerAgentApiKey(
      walletAddress,
      agentName.trim(),
      apiKey,
      normalizedNftMint,
      normalizeAgentPermissions(permissions),
      normalizeAgentCategories(categories),
      spendingLimits,
      normalizedAssetAddress,
      {
        description: description?.trim() || undefined,
        imageUri: imageUri?.trim() || undefined,
        saidVerified,
        services: normalizeAgentServices(services),
      }
    );

    return NextResponse.json(
      {
        success: true,
        agent: {
          apiKey,
          walletAddress: record.walletAddress,
          agentName: record.agentName,
          nftMint: record.nftMint,
          agentAssetAddress: record.agentAssetAddress,
          categories: record.categories,
          description: record.description,
          imageUri: record.imageUri,
          permissions: record.permissions,
          saidVerified: record.saidVerified,
          services: record.services,
          spendingLimits: record.spendingLimits,
          createdAt: record.createdAt,
        },
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Failed to register agent:", error);
    return toAgentOwnerRequestErrorResponse(error as Error, "Failed to register agent")
  }
}

/**
 * GET /api/agents
 * Get all agents (public view, no API keys exposed)
 */
export async function GET() {
  try {
    const agents = getPublicAgents();

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
