import type {
  AgentConnectionStatus,
  AgentPermission,
  PublicAgentRecord,
} from "@/lib/agents"

export function formatAgentWallet(walletAddress: string): string {
  if (walletAddress.length <= 12) {
    return walletAddress
  }

  return `${walletAddress.slice(0, 6)}...${walletAddress.slice(-4)}`
}

export function formatAgentCreatedAt(createdAt: number): string {
  return new Date(createdAt).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  })
}

export function getAgentDetailHref(agent: PublicAgentRecord): string {
  return `/agents/${agent.agentAssetAddress ?? agent.walletAddress}`
}

export function getAgentConnectionBadgeClassName(
  status: AgentConnectionStatus
): string {
  return status === "connected"
    ? "border-emerald-500/25 bg-emerald-500/15 text-emerald-200"
    : "border-white/10 bg-white/5 text-white/65"
}

export function getAgentPermissionBadgeClassName(
  permission: AgentPermission,
  enabled: boolean
): string {
  if (!enabled) {
    return "border-white/10 bg-white/5 text-white/35"
  }

  switch (permission) {
    case "Trade":
      return "border-blue-500/25 bg-blue-500/15 text-blue-200"
    case "Bid":
      return "border-violet-500/25 bg-violet-500/15 text-violet-200"
    case "Chat":
      return "border-emerald-500/25 bg-emerald-500/15 text-emerald-200"
  }
}
