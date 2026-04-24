import Link from "next/link"

import { HomeImage } from "@/components/home/HomeImage"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardFooter } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import { AGENT_PERMISSION_KEYS, type PublicAgentRecord } from "@/lib/agents"

import {
  formatAgentCreatedAt,
  formatAgentWallet,
  getAgentConnectionBadgeClassName,
  getAgentDetailHref,
  getAgentPermissionBadgeClassName,
} from "../_lib/formatters"

interface AgentCardProps {
  agent: PublicAgentRecord
}

function AgentCardImage({ agent }: AgentCardProps) {
  if (!agent.imageUri) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-linear-to-br from-gold-500/10 via-dark-800 to-dark-900 text-4xl font-serif text-gold-300">
        {agent.agentName.slice(0, 1).toUpperCase()}
      </div>
    )
  }

  return (
    <HomeImage
      alt={agent.agentName}
      sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
      src={agent.imageUri}
      className="group-hover:scale-[1.02]"
    />
  )
}

export function AgentCard({ agent }: AgentCardProps) {
  return (
    <Link className="group block h-full" href={getAgentDetailHref(agent)}>
      <Card className="flex h-full flex-col overflow-hidden border-white/5 bg-dark-800/85 py-0 text-white transition duration-200 hover:border-white/15 hover:bg-dark-800">
        <div className="relative aspect-square overflow-hidden bg-dark-900">
          <AgentCardImage agent={agent} />

          <div className="absolute left-3 top-3 flex flex-wrap gap-2">
            <Badge className={getAgentConnectionBadgeClassName(agent.connectionStatus)}>
              {agent.connectionStatus === "connected" ? "Connected" : "Registered"}
            </Badge>
            {agent.saidVerified ? (
              <Badge className="border-gold-500/25 bg-gold-500/15 text-gold-200">
                SAID Verified
              </Badge>
            ) : null}
          </div>
        </div>

        <CardContent className="flex flex-1 flex-col gap-4 px-5 py-5">
          <div className="space-y-2">
            <div className="flex items-start justify-between gap-3">
              <div className="space-y-1">
                <h2 className="font-serif text-xl text-white">{agent.agentName}</h2>
                <p className="text-xs font-mono text-white/40">
                  Owner {formatAgentWallet(agent.walletAddress)}
                </p>
              </div>

              <span className="rounded-full border border-white/10 bg-white/5 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-white/50">
                {formatAgentCreatedAt(agent.createdAt)}
              </span>
            </div>

            <p className="line-clamp-3 text-sm leading-6 text-white/55">
              {agent.description?.trim() || "No public description has been added for this agent yet."}
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            {agent.categories.length > 0 ? (
              agent.categories.slice(0, 3).map((category) => (
                <Badge
                  key={category}
                  className="border-white/10 bg-dark-900/80 text-white/70"
                  variant="outline"
                >
                  {category}
                </Badge>
              ))
            ) : (
              <Badge className="border-white/10 bg-dark-900/80 text-white/70" variant="outline">
                No categories
              </Badge>
            )}
          </div>

          <Separator className="bg-white/8" />

          <div className="space-y-3">
            <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-white/40">
              Permissions
            </p>

            <div className="flex flex-wrap gap-2">
              {AGENT_PERMISSION_KEYS.map((permission) => (
                <Badge
                  key={permission}
                  className={getAgentPermissionBadgeClassName(
                    permission,
                    agent.permissions[permission]
                  )}
                  variant="outline"
                >
                  {permission}
                </Badge>
              ))}
            </div>
          </div>
        </CardContent>

        <CardFooter className="border-t border-white/6 bg-dark-900/55 px-5 py-4 text-sm text-gold-300">
          View agent profile →
        </CardFooter>
      </Card>
    </Link>
  )
}