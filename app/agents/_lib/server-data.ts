import { cache } from "react"

import { getPublicAgents } from "@/app/lib/api-keys"
import type { PublicAgentRecord } from "@/lib/agents"

export const getAgentByIdentifier = cache(
  (identifier: string): PublicAgentRecord | null => {
    return (
      getPublicAgents().find(
        (agent) =>
          agent.agentAssetAddress === identifier ||
          agent.walletAddress === identifier
      ) ?? null
    )
  }
)