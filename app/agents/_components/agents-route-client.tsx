"use client"

import Image from "next/image"
import Link from "next/link"
import { SearchIcon } from "lucide-react"
import { useDeferredValue, useMemo, useState } from "react"

import { AgentCard } from "./agent-card"
import { Badge } from "@/components/ui/badge"
import { Button, buttonVariants } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Separator } from "@/components/ui/separator"
import { AGENT_PERMISSION_KEYS, type AgentPermission, type PublicAgentRecord } from "@/lib/agents"
import { cn } from "@/lib/utils"

interface AgentsRouteClientProps {
  agents: PublicAgentRecord[]
}

function AgentsEmptyState() {
  return (
    <Card className="border-white/5 bg-dark-800/80 py-0">
      <CardContent className="space-y-4 px-6 py-14 text-center">
        <h2 className="font-serif text-2xl text-white">No agents available yet</h2>
        <p className="mx-auto max-w-xl text-sm leading-6 text-white/55">
          Registered Artifacte agents will appear here once they complete setup.
          The 8004 registry integration is still being wired server-side, so this
          view currently reflects the local Artifacte registry.
        </p>
        <Link
          href="/agents/register"
          className={cn(
            buttonVariants({ size: "lg" }),
            "bg-gold-500 text-dark-900 hover:bg-gold-600"
          )}
        >
          Register an Agent
        </Link>
      </CardContent>
    </Card>
  )
}

function FilterButton({
  active,
  onClick,
  permission,
}: {
  active: boolean
  onClick: () => void
  permission: AgentPermission
}) {
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={onClick}
      className={cn(
        "border-white/10 bg-dark-900/70 text-white/65 hover:bg-dark-900 hover:text-white",
        active && "border-gold-500/40 bg-gold-500 text-dark-900 hover:bg-gold-500/90"
      )}
    >
      {permission}
    </Button>
  )
}

export function AgentsRouteClient({ agents }: AgentsRouteClientProps) {
  const [searchInput, setSearchInput] = useState("")
  const [activePermission, setActivePermission] =
    useState<AgentPermission | null>(null)
  const deferredSearchInput = useDeferredValue(searchInput)

  const filteredAgents = useMemo(() => {
    const normalizedSearch = deferredSearchInput.trim().toLowerCase()

    return agents.filter((agent) => {
      const matchesSearch =
        normalizedSearch.length === 0 ||
        agent.agentName.toLowerCase().includes(normalizedSearch) ||
        agent.description?.toLowerCase().includes(normalizedSearch) ||
        agent.categories.some((category) =>
          category.toLowerCase().includes(normalizedSearch)
        )

      const matchesPermission =
        !activePermission || agent.permissions[activePermission]

      return matchesSearch && matchesPermission
    })
  }, [activePermission, agents, deferredSearchInput])

  return (
    <main className="min-h-screen bg-dark-900 pb-20 pt-24">
      <div className="mx-auto max-w-7xl space-y-10 px-4 sm:px-6 lg:px-8">
        <section className="space-y-6">
          <Link
            href="/"
            className={cn(
              buttonVariants({ size: "sm", variant: "ghost" }),
              "inline-flex px-0 text-gold-400 hover:bg-transparent hover:text-gold-300"
            )}
          >
            ← Back to Home
          </Link>

          <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-3">
                <Badge className="border-gold-500/25 bg-gold-500/10 text-[11px] font-semibold uppercase tracking-[0.24em] text-gold-300">
                  AI Agents
                </Badge>
                <span className="text-xs uppercase tracking-[0.22em] text-white/35">
                  Artifacte Registry
                </span>
              </div>

              <div className="space-y-3">
                <h1 className="font-serif text-4xl text-white sm:text-5xl">
                  Agent Dashboard
                </h1>
                <p className="max-w-3xl text-sm leading-6 text-white/60 sm:text-base">
                  Discover registered Artifacte agents, review their permissions,
                  and inspect the public profile each operator has configured for
                  autonomous activity on the platform.
                </p>
              </div>
            </div>

            <div className="flex flex-col items-start gap-4 rounded-3xl border border-white/10 bg-dark-800/80 p-5 shadow-[0_20px_60px_rgba(0,0,0,0.28)] sm:min-w-80">
              <div className="flex items-center gap-3">
                <div className="relative h-12 w-12 overflow-hidden rounded-2xl border border-white/10 bg-dark-900">
                  <Image
                    alt="Hosico Labs"
                    fill
                    sizes="48px"
                    src="/hosico-labs.jpg"
                    className="object-cover"
                  />
                </div>
                <div>
                  <p className="text-sm font-medium text-white">Managed with Hosico Labs</p>
                  <p className="text-xs text-white/45">
                    Local Artifacte registry is the active source for this route.
                  </p>
                </div>
              </div>

              <Link
                href="/agents/register"
                className={cn(
                  buttonVariants(),
                  "w-full bg-gold-500 text-center text-dark-900 hover:bg-gold-600"
                )}
              >
                Register Agent
              </Link>
            </div>
          </div>
        </section>

        <Card className="border-white/5 bg-dark-800/75 py-0 shadow-[0_24px_70px_rgba(0,0,0,0.24)]">
          <CardContent className="space-y-6 px-4 py-5 sm:px-6 sm:py-6">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div className="relative flex-1">
                <SearchIcon className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-white/35" />
                <Input
                  type="text"
                  value={searchInput}
                  onChange={(event) => setSearchInput(event.target.value)}
                  placeholder="Search by agent name, category, or description"
                  className="h-11 border-white/10 bg-dark-900/70 pl-10 text-white placeholder:text-white/35"
                />
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {AGENT_PERMISSION_KEYS.map((permission) => (
                  <FilterButton
                    key={permission}
                    permission={permission}
                    active={activePermission === permission}
                    onClick={() =>
                      setActivePermission((currentValue) =>
                        currentValue === permission ? null : permission
                      )
                    }
                  />
                ))}
              </div>
            </div>

            <Separator className="bg-white/5" />

            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex flex-wrap items-center gap-3 text-sm text-white/50">
                <span>
                  Showing <span className="font-semibold text-gold-300">{filteredAgents.length}</span> of {agents.length} agents
                </span>
                {activePermission ? (
                  <Badge className="border-gold-500/20 bg-gold-500/10 text-gold-300" variant="outline">
                    Filtered by {activePermission}
                  </Badge>
                ) : null}
              </div>

              {(searchInput || activePermission) ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setSearchInput("")
                    setActivePermission(null)
                  }}
                  className="text-gold-300 hover:bg-gold-500/10 hover:text-gold-200"
                >
                  Clear filters
                </Button>
              ) : null}
            </div>
          </CardContent>
        </Card>

        {filteredAgents.length === 0 ? (
          <AgentsEmptyState />
        ) : (
          <section className="grid gap-6 sm:grid-cols-2 xl:grid-cols-3">
            {filteredAgents.map((agent) => (
              <AgentCard agent={agent} key={agent.agentAssetAddress ?? agent.walletAddress} />
            ))}
          </section>
        )}
      </div>
    </main>
  )
}