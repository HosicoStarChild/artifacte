const textEncoder = new TextEncoder()

export const ADMIN_REQUEST_HEADERS = {
  signature: "x-artifacte-admin-signature",
  timestamp: "x-artifacte-admin-timestamp",
  wallet: "x-artifacte-admin-wallet",
} as const

export type AdminRequestPermission = "access" | "admin" | "owner"

export type AdminMessageSigner = (
  message: Uint8Array
) => Promise<Uint8Array>

export interface SignedAdminRequestInput {
  walletAddress: string
  signMessage: AdminMessageSigner
  method: string
  path: string
  body?: string
}

interface AdminRequestMessageParts {
  bodyDigest: string
  method: string
  path: string
  timestamp: number
  walletAddress: string
}

export function buildAdminRequestMessage({
  bodyDigest,
  method,
  path,
  timestamp,
  walletAddress,
}: AdminRequestMessageParts): string {
  return [
    "Artifacte admin request",
    method.toUpperCase(),
    path,
    walletAddress,
    String(timestamp),
    bodyDigest,
  ].join("\n")
}

export function bytesToHex(value: ArrayBuffer | Uint8Array): string {
  const bytes = value instanceof Uint8Array ? value : new Uint8Array(value)

  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("")
}

export async function hashAdminRequestBody(body = ""): Promise<string> {
  const payload = textEncoder.encode(body)
  const digest = await crypto.subtle.digest("SHA-256", payload)

  return bytesToHex(digest)
}

export function encodeBase64(value: Uint8Array): string {
  let binary = ""
  const chunkSize = 0x8000

  for (let index = 0; index < value.length; index += chunkSize) {
    const chunk = value.subarray(index, index + chunkSize)

    for (let chunkIndex = 0; chunkIndex < chunk.length; chunkIndex += 1) {
      binary += String.fromCharCode(chunk[chunkIndex] ?? 0)
    }
  }

  if (typeof btoa === "function") {
    return btoa(binary)
  }

  return Buffer.from(binary, "binary").toString("base64")
}

export function decodeBase64(value: string): Uint8Array {
  if (typeof atob === "function") {
    const binary = atob(value)

    return Uint8Array.from(binary, (character) => character.charCodeAt(0))
  }

  return Uint8Array.from(Buffer.from(value, "base64"))
}

export async function createSignedAdminHeaders({
  walletAddress,
  signMessage,
  method,
  path,
  body = "",
}: SignedAdminRequestInput): Promise<Record<string, string>> {
  if (!walletAddress) {
    throw new Error("Wallet is required for admin requests")
  }

  const timestamp = Date.now()
  const bodyDigest = await hashAdminRequestBody(body)
  const message = buildAdminRequestMessage({
    bodyDigest,
    method,
    path,
    timestamp,
    walletAddress,
  })
  const signature = await signMessage(textEncoder.encode(message))

  return {
    [ADMIN_REQUEST_HEADERS.signature]: encodeBase64(signature),
    [ADMIN_REQUEST_HEADERS.timestamp]: String(timestamp),
    [ADMIN_REQUEST_HEADERS.wallet]: walletAddress,
  }
}