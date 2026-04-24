import { bytesToHex, encodeBase64 } from "@/lib/admin-request"

const textEncoder = new TextEncoder()

export const AGENT_OWNER_REQUEST_HEADERS = {
  signature: "x-artifacte-agent-signature",
  timestamp: "x-artifacte-agent-timestamp",
  wallet: "x-artifacte-agent-wallet",
} as const

export type AgentOwnerMessageSigner = (
  message: Uint8Array
) => Promise<Uint8Array>

export interface SignedAgentOwnerRequestInput {
  walletAddress: string
  signMessage: AgentOwnerMessageSigner
  method: string
  path: string
  body?: string
}

interface AgentOwnerRequestMessageParts {
  bodyDigest: string
  method: string
  path: string
  timestamp: number
  walletAddress: string
}

export function buildAgentOwnerRequestMessage({
  bodyDigest,
  method,
  path,
  timestamp,
  walletAddress,
}: AgentOwnerRequestMessageParts): string {
  return [
    "Artifacte agent owner request",
    method.toUpperCase(),
    path,
    walletAddress,
    String(timestamp),
    bodyDigest,
  ].join("\n")
}

export async function hashAgentOwnerRequestBody(body = ""): Promise<string> {
  const payload = Uint8Array.from(textEncoder.encode(body))
  const digest = await crypto.subtle.digest("SHA-256", payload)

  return bytesToHex(digest)
}

export async function createSignedAgentOwnerHeaders({
  walletAddress,
  signMessage,
  method,
  path,
  body = "",
}: SignedAgentOwnerRequestInput): Promise<Record<string, string>> {
  if (!walletAddress) {
    throw new Error("Wallet is required for agent owner requests")
  }

  const timestamp = Date.now()
  const bodyDigest = await hashAgentOwnerRequestBody(body)
  const message = buildAgentOwnerRequestMessage({
    bodyDigest,
    method,
    path,
    timestamp,
    walletAddress,
  })
  const signature = await signMessage(textEncoder.encode(message))

  return {
    [AGENT_OWNER_REQUEST_HEADERS.signature]: encodeBase64(signature),
    [AGENT_OWNER_REQUEST_HEADERS.timestamp]: String(timestamp),
    [AGENT_OWNER_REQUEST_HEADERS.wallet]: walletAddress,
  }
}