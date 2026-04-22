import {
  createSignedAgentOwnerHeaders,
  type AgentOwnerMessageSigner,
} from "@/lib/agent-owner-request"

interface SignedAgentOwnerClientInput<TBody> {
  body?: TBody
  method: string
  path: string
  signMessage: AgentOwnerMessageSigner
  walletAddress: string
}

export async function signedAgentOwnerJsonRequest<TResponse, TBody = undefined>({
  body,
  method,
  path,
  signMessage,
  walletAddress,
}: SignedAgentOwnerClientInput<TBody>): Promise<TResponse> {
  const bodyText = body ? JSON.stringify(body) : ""
  const signedHeaders = await createSignedAgentOwnerHeaders({
    walletAddress,
    signMessage,
    method,
    path,
    body: bodyText,
  })

  const response = await fetch(path, {
    method,
    headers: {
      ...(bodyText ? { "Content-Type": "application/json" } : {}),
      ...signedHeaders,
    },
    ...(bodyText ? { body: bodyText } : {}),
    cache: "no-store",
  })

  const responseText = await response.text()
  const responseBody = responseText
    ? (JSON.parse(responseText) as TResponse & { error?: string })
    : ({} as TResponse & { error?: string })

  if (!response.ok) {
    throw new Error(responseBody.error ?? "Agent owner request failed")
  }

  return responseBody
}