import type { NextRequest } from "next/server"
import { NextResponse } from "next/server"
import { Base58, Ed25519 } from "ox"

import {
  AGENT_OWNER_REQUEST_HEADERS,
  buildAgentOwnerRequestMessage,
  hashAgentOwnerRequestBody,
} from "@/lib/agent-owner-request"
import { decodeBase64 } from "@/lib/admin-request"

const AGENT_OWNER_REQUEST_MAX_AGE_MS = 5 * 60_000
const agentOwnerReplayGuard = new Map<string, number>()

export class AgentOwnerRequestError extends Error {
  readonly status: number

  constructor(message: string, status = 403) {
    super(message)
    this.name = "AgentOwnerRequestError"
    this.status = status
  }
}

export interface VerifiedAgentOwnerRequest {
  timestamp: number
  walletAddress: string
}

function pruneReplayGuard(now: number) {
  for (const [key, timestamp] of agentOwnerReplayGuard.entries()) {
    if (timestamp <= now - AGENT_OWNER_REQUEST_MAX_AGE_MS) {
      agentOwnerReplayGuard.delete(key)
    }
  }
}

function parseTimestamp(value: string | null): number {
  const timestamp = Number(value)

  if (!Number.isFinite(timestamp)) {
    throw new AgentOwnerRequestError(
      "Missing or invalid agent owner timestamp",
      400
    )
  }

  return timestamp
}

function getSignedRequestPath(request: NextRequest): string {
  return `${request.nextUrl.pathname}${request.nextUrl.search}`
}

export async function assertSignedAgentOwnerRequest(
  request: NextRequest,
  rawBody = ""
): Promise<VerifiedAgentOwnerRequest> {
  const walletAddress =
    request.headers.get(AGENT_OWNER_REQUEST_HEADERS.wallet)?.trim() ?? ""
  const signatureHeader =
    request.headers.get(AGENT_OWNER_REQUEST_HEADERS.signature)?.trim() ?? ""
  const timestamp = parseTimestamp(
    request.headers.get(AGENT_OWNER_REQUEST_HEADERS.timestamp)
  )

  if (!walletAddress || !signatureHeader) {
    throw new AgentOwnerRequestError("Missing signed agent owner headers", 400)
  }

  const now = Date.now()
  if (Math.abs(now - timestamp) > AGENT_OWNER_REQUEST_MAX_AGE_MS) {
    throw new AgentOwnerRequestError("Expired agent owner signature", 401)
  }

  const publicKey = Base58.toBytes(walletAddress)
  const signature = decodeBase64(signatureHeader)
  const bodyDigest = await hashAgentOwnerRequestBody(rawBody)
  const message = buildAgentOwnerRequestMessage({
    bodyDigest,
    method: request.method,
    path: getSignedRequestPath(request),
    timestamp,
    walletAddress,
  })
  const isValid = Ed25519.verify({
    payload: new TextEncoder().encode(message),
    publicKey,
    signature,
  })

  if (!isValid) {
    throw new AgentOwnerRequestError("Invalid agent owner signature", 401)
  }

  if (request.method !== "GET" && request.method !== "HEAD") {
    pruneReplayGuard(now)

    const replayKey = `${walletAddress}:${timestamp}:${signatureHeader}`
    if (agentOwnerReplayGuard.has(replayKey)) {
      throw new AgentOwnerRequestError("Agent owner request already used", 409)
    }

    agentOwnerReplayGuard.set(replayKey, timestamp)
  }

  return {
    timestamp,
    walletAddress,
  }
}

export async function readSignedAgentOwnerJson<T>(
  request: NextRequest
): Promise<{ body: T; context: VerifiedAgentOwnerRequest; rawBody: string }> {
  const rawBody = await request.text()
  const context = await assertSignedAgentOwnerRequest(request, rawBody)

  if (!rawBody) {
    return {
      body: {} as T,
      context,
      rawBody,
    }
  }

  try {
    return {
      body: JSON.parse(rawBody) as T,
      context,
      rawBody,
    }
  } catch {
    throw new AgentOwnerRequestError("Invalid request body", 400)
  }
}

export function toAgentOwnerRequestErrorResponse(
  error: Error,
  fallbackMessage: string
) {
  if (error instanceof AgentOwnerRequestError) {
    return NextResponse.json({ error: error.message }, { status: error.status })
  }

  return NextResponse.json({ error: fallbackMessage }, { status: 500 })
}