import { getPublicAgents } from "@/app/lib/api-keys"

import { AgentsRouteClient } from "./_components/agents-route-client"

export default function AgentsPage() {
  const agents = getPublicAgents()

  return <AgentsRouteClient agents={agents} />
}
