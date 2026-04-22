import Link from "next/link"
import { notFound } from "next/navigation"
import { Suspense } from "react"

import { HomeImage } from "@/components/home/HomeImage"
import { Badge } from "@/components/ui/badge"
import { buttonVariants } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import { AGENT_PERMISSION_KEYS, type PublicAgentRecord } from "@/lib/agents"
import { cn } from "@/lib/utils"

import { AgentOwnerPanel } from "../_components/agent-owner-panel"
import {
  formatAgentCreatedAt,
  formatAgentWallet,
  getAgentConnectionBadgeClassName,
  getAgentPermissionBadgeClassName,
} from "../_lib/formatters"
import { getAgentByIdentifier } from "../_lib/server-data"

interface AgentProfilePageProps {
  params: Promise<{
    address: string
  }>
}

function AgentProfileImage({ agent }: { agent: PublicAgentRecord }) {
  if (!agent.imageUri) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-linear-to-br from-gold-500/10 via-dark-800 to-dark-900 text-6xl font-serif text-gold-300">
        {agent.agentName.slice(0, 1).toUpperCase()}
      </div>
    )
  }

  return (
    <HomeImage
      alt={agent.agentName}
      sizes="(max-width: 1024px) 100vw, 33vw"
      src={agent.imageUri}
    />
  )
}

export default async function AgentProfilePage({ params }: AgentProfilePageProps) {
  return (
    <Suspense fallback={<AgentProfilePageFallback />}>
      <AgentProfilePageContent params={params} />
    </Suspense>
  )
}

function AgentProfilePageFallback() {
  return (
    <main className="min-h-screen bg-dark-900 pb-20 pt-24">
      <div className="mx-auto max-w-6xl px-4 py-20 text-center text-white/55 sm:px-6 lg:px-8">
        Loading agent...
      </div>
    </main>
  )
}

async function AgentProfilePageContent({ params }: AgentProfilePageProps) {
  const { address } = await params
  const agent = getAgentByIdentifier(address)

  if (!agent) {
    notFound()
  }

  return (
    <main className="min-h-screen bg-dark-900 pb-20 pt-24">
      <div className="mx-auto max-w-6xl space-y-8 px-4 sm:px-6 lg:px-8">
        <Link
          href="/agents"
          className={cn(
            buttonVariants({ size: "sm", variant: "ghost" }),
            "inline-flex px-0 text-gold-400 hover:bg-transparent hover:text-gold-300"
          )}
        >
          ← Back to Agents
        </Link>

        <section className="grid gap-8 lg:grid-cols-[minmax(0,360px)_minmax(0,1fr)] lg:items-start">
          <Card className="overflow-hidden border-white/5 bg-dark-800/80 py-0 text-white lg:sticky lg:top-28">
            <div className="relative aspect-square overflow-hidden bg-dark-900">
              <AgentProfileImage agent={agent} />
            </div>

            <CardContent className="space-y-5 px-6 py-6">
              <div className="space-y-3">
                <div className="flex flex-wrap gap-2">
                  <Badge className={getAgentConnectionBadgeClassName(agent.connectionStatus)}>
                    {agent.connectionStatus === "connected" ? "Connected" : "Registered"}
                  </Badge>
                  {agent.saidVerified ? (
                    <Badge className="border-gold-500/20 bg-gold-500/10 text-gold-300">
                      SAID Verified
                    </Badge>
                  ) : null}
                </div>

                <div>
                  <h1 className="font-serif text-3xl text-white">{agent.agentName}</h1>
                  <p className="mt-2 text-xs font-mono text-white/40">
                    Owner {formatAgentWallet(agent.walletAddress)}
                  </p>
                </div>
              </div>

              <Separator className="bg-white/8" />

              <div className="space-y-3 text-sm text-white/55">
                <div className="flex items-center justify-between gap-4">
                  <span>Created</span>
                  <span className="text-white/80">{formatAgentCreatedAt(agent.createdAt)}</span>
                </div>
                <div className="flex items-center justify-between gap-4">
                  <span>Registry source</span>
                  <span className="text-white/80">Artifacte Local</span>
                </div>
                <div className="flex items-center justify-between gap-4">
                  <span>Asset identifier</span>
                  <span className="truncate text-right font-mono text-xs text-white/70">
                    {agent.agentAssetAddress ?? agent.walletAddress}
                  </span>
                </div>
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
          </Card>

          <div className="space-y-6">
            <Card className="border-white/5 bg-dark-800/80 py-0 text-white">
              <CardContent className="space-y-5 px-6 py-6">
                <div className="space-y-2">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-gold-300">
                    Public profile
                  </p>
                  <h2 className="font-serif text-2xl text-white">About this agent</h2>
                </div>

                <p className="text-sm leading-7 text-white/60">
                  {agent.description?.trim() ||
                    "This agent has not published a public description yet."}
                </p>

                {agent.categories.length > 0 ? (
                  <div className="space-y-3">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-white/40">
                      Categories
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {agent.categories.map((category) => (
                        <Badge
                          key={category}
                          className="border-white/10 bg-dark-900/80 text-white/75"
                          variant="outline"
                        >
                          {category}
                        </Badge>
                      ))}
                    </div>
                  </div>
                ) : null}

                {agent.services.length > 0 ? (
                  <div className="space-y-4">
                    <Separator className="bg-white/8" />
                    <div className="space-y-3">
                      <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-white/40">
                        Services
                      </p>
                      <div className="space-y-3">
                        {agent.services.map((service) => (
                          <div
                            key={`${service.type}:${service.value}`}
                            className="rounded-2xl border border-white/8 bg-dark-900/65 p-4"
                          >
                            <p className="text-xs uppercase tracking-[0.18em] text-white/40">
                              {service.type}
                            </p>
                            <p className="mt-2 break-all font-mono text-sm text-gold-200">
                              {service.value}
                            </p>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                ) : null}
              </CardContent>
            </Card>

            <Card className="border-white/5 bg-dark-800/80 py-0 text-white">
              <CardContent className="space-y-4 px-6 py-6">
                <div className="space-y-2">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-gold-300">
                    Reputation
                  </p>
                  <h2 className="font-serif text-2xl text-white">Feedback integration pending</h2>
                </div>
                <p className="text-sm leading-7 text-white/60">
                  The previous detail route called placeholder 8004 reputation and
                  feedback endpoints that are not implemented yet. This refactor keeps
                  the public profile functional and removes the broken feedback form
                  until the server-side 8004 integration is available.
                </p>
              </CardContent>
            </Card>

            <AgentOwnerPanel
              assetAddress={agent.agentAssetAddress}
              ownerWalletAddress={agent.walletAddress}
            />
          </div>
        </section>
      </div>
    </main>
  )
}
