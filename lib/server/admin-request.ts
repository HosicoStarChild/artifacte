import type { NextRequest } from "next/server"
import { NextResponse } from "next/server"
import { Base58, Ed25519 } from "ox"

import {
  ADMIN_REQUEST_HEADERS,
  buildAdminRequestMessage,
  decodeBase64,
  hashAdminRequestBody,
  type AdminRequestPermission,
} from "@/lib/admin-request"
import { hasAdminAccess, isAdminWallet, isOwnerWallet } from "@/lib/admin"

const ADMIN_REQUEST_MAX_AGE_MS = 5 * 60_000
const adminReplayGuard = new Map<string, number>()

export class AdminRequestError extends Error {
  readonly status: number

  constructor(message: string, status = 403) {
    super(message)
    this.name = "AdminRequestError"
    this.status = status
  }
}

export interface VerifiedAdminRequest {
  timestamp: number
  walletAddress: string
}

function assertPermission(permission: AdminRequestPermission, walletAddress: string) {
  const isAllowed =
    permission === "owner"
      ? isOwnerWallet(walletAddress)
      : permission === "admin"
        ? isAdminWallet(walletAddress)
        : hasAdminAccess(walletAddress)

  if (!isAllowed) {
    throw new AdminRequestError("Unauthorized", 403)
  }
}

function pruneReplayGuard(now: number) {
  for (const [key, timestamp] of adminReplayGuard.entries()) {
    if (timestamp <= now - ADMIN_REQUEST_MAX_AGE_MS) {
      adminReplayGuard.delete(key)
    }
  }
}

function parseAdminTimestamp(value: string | null): number {
  const timestamp = Number(value)

  if (!Number.isFinite(timestamp)) {
    throw new AdminRequestError("Missing or invalid admin timestamp", 400)
  }

  return timestamp
}

function getSignedRequestPath(request: NextRequest): string {
  return `${request.nextUrl.pathname}${request.nextUrl.search}`
}

export async function assertSignedAdminRequest(
  request: NextRequest,
  permission: AdminRequestPermission,
  rawBody = ""
): Promise<VerifiedAdminRequest> {
  const walletAddress = request.headers.get(ADMIN_REQUEST_HEADERS.wallet)?.trim() ?? ""
  const signatureHeader =
    request.headers.get(ADMIN_REQUEST_HEADERS.signature)?.trim() ?? ""
  const timestamp = parseAdminTimestamp(
    request.headers.get(ADMIN_REQUEST_HEADERS.timestamp)
  )

  if (!walletAddress || !signatureHeader) {
    throw new AdminRequestError("Missing signed admin headers", 400)
  }

  assertPermission(permission, walletAddress)

  const now = Date.now()

  if (Math.abs(now - timestamp) > ADMIN_REQUEST_MAX_AGE_MS) {
    throw new AdminRequestError("Expired admin request signature", 401)
  }

  const publicKey = Base58.toBytes(walletAddress)
  const signature = decodeBase64(signatureHeader)
  const bodyDigest = await hashAdminRequestBody(rawBody)
  const message = buildAdminRequestMessage({
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
    throw new AdminRequestError("Invalid admin request signature", 401)
  }

  if (request.method !== "GET" && request.method !== "HEAD") {
    pruneReplayGuard(now)

    const replayKey = `${walletAddress}:${timestamp}:${signatureHeader}`

    if (adminReplayGuard.has(replayKey)) {
      throw new AdminRequestError("Admin request already used", 409)
    }

    adminReplayGuard.set(replayKey, timestamp)
  }

  return {
    timestamp,
    walletAddress,
  }
}

export async function readSignedAdminJson<T>(
  request: NextRequest,
  permission: AdminRequestPermission
): Promise<{ body: T; context: VerifiedAdminRequest; rawBody: string }> {
  const rawBody = await request.text()
  const context = await assertSignedAdminRequest(request, permission, rawBody)

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
    throw new AdminRequestError("Invalid request body", 400)
  }
}

export function toAdminRequestErrorResponse(
  error: Error,
  fallbackMessage: string
) {
  if (error instanceof AdminRequestError) {
    return NextResponse.json({ error: error.message }, { status: error.status })
  }

  return NextResponse.json({ error: fallbackMessage }, { status: 500 })
}