"use client"

import { CopyIcon, KeyRoundIcon, RefreshCcwIcon, Wallet2Icon } from "lucide-react"
import { useEffect, useState } from "react"
import { useWallet } from "@solana/wallet-adapter-react"

import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Separator } from "@/components/ui/separator"
import {
  AGENT_SPENDING_LIMIT_CURRENCIES,
  AGENT_SPENDING_LIMIT_PERIODS,
  type AgentBudgetStatus,
  type AgentSpendingLimitPeriod,
  type AgentSpendingLimits,
  type OwnerAgentRecord,
} from "@/lib/agents"

import { signedAgentOwnerJsonRequest } from "../_lib/client"

interface AgentOwnerPanelProps {
  assetAddress?: string
  ownerWalletAddress: string
}

interface OwnerAgentResponse {
  agent: OwnerAgentRecord
  success: true
}

interface BudgetStatusResponse extends AgentBudgetStatus {
  address: string
  success: true
}

interface UpdateLimitsResponse {
  agent: {
    agentName: string
    spendingLimits?: AgentSpendingLimits
    walletAddress: string
  }
  success: true
}

interface RegenerateApiKeyResponse {
  agent: {
    agentName: string
    apiKey: string
    apiKeyPreview?: string
    walletAddress: string
  }
  success: true
}

function formatLimitLabel(period: AgentSpendingLimitPeriod): string {
  return `${period.slice(0, 1).toUpperCase()}${period.slice(1)} limit`
}

interface ConnectedAgentOwnerPanelProps {
  assetAddress?: string
  signMessage: (message: Uint8Array) => Promise<Uint8Array>
  walletAddress: string
}

export function AgentOwnerPanel({
  assetAddress,
  ownerWalletAddress,
}: AgentOwnerPanelProps) {
  const { connected, publicKey, signMessage } = useWallet()
  const currentWalletAddress = publicKey?.toBase58() ?? null
  const isOwnerWallet = currentWalletAddress === ownerWalletAddress

  if (!connected || !currentWalletAddress) {
    return (
      <Card className="border-white/5 bg-dark-800/80 py-0">
        <CardContent className="flex items-center gap-4 px-5 py-5 text-sm text-white/55">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-white/10 bg-dark-900 text-white/45">
            <Wallet2Icon className="size-5" />
          </div>
          Connect the owner wallet to view private agent controls.
        </CardContent>
      </Card>
    )
  }

  if (!isOwnerWallet) {
    return null
  }

  if (!signMessage) {
    return (
      <Card className="border-white/5 bg-dark-800/80 py-0">
        <CardContent className="px-5 py-5 text-sm text-white/55">
          This wallet does not support message signing. Switch to a wallet that can
          sign messages to manage API keys and spending limits.
        </CardContent>
      </Card>
    )
  }

  return (
    <ConnectedAgentOwnerPanel
      assetAddress={assetAddress}
      key={`${currentWalletAddress}:${assetAddress ?? "default"}`}
      signMessage={signMessage}
      walletAddress={currentWalletAddress}
    />
  )
}

function ConnectedAgentOwnerPanel({
  assetAddress,
  signMessage,
  walletAddress,
}: ConnectedAgentOwnerPanelProps) {
  const [budgetStatus, setBudgetStatus] = useState<AgentBudgetStatus | null>(null)
  const [editedLimits, setEditedLimits] = useState<AgentSpendingLimits | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [isEditingLimits, setIsEditingLimits] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [isRegenerating, setIsRegenerating] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [latestApiKey, setLatestApiKey] = useState<string | null>(null)
  const [ownerAgent, setOwnerAgent] = useState<OwnerAgentRecord | null>(null)

  useEffect(() => {
    const ownerSigner = signMessage
    const signedWalletAddress = walletAddress

    let cancelled = false

    async function loadOwnerState() {
      setIsLoading(true)
      setErrorMessage(null)

      try {
        const mePath = assetAddress
          ? `/api/agents/me?assetAddress=${encodeURIComponent(assetAddress)}`
          : "/api/agents/me"
        const budgetPath = `/api/agents/budget?address=${encodeURIComponent(
          signedWalletAddress
        )}`

        const [ownerResponse, budgetResponse] = await Promise.all([
          signedAgentOwnerJsonRequest<OwnerAgentResponse>({
            method: "GET",
            path: mePath,
            signMessage: ownerSigner,
            walletAddress: signedWalletAddress,
          }),
          signedAgentOwnerJsonRequest<BudgetStatusResponse>({
            method: "GET",
            path: budgetPath,
            signMessage: ownerSigner,
            walletAddress: signedWalletAddress,
          }),
        ])

        if (cancelled) {
          return
        }

        setOwnerAgent(ownerResponse.agent)
        setBudgetStatus({
          limits: budgetResponse.limits,
          progress: budgetResponse.progress,
        })
      } catch (error) {
        if (!cancelled) {
          setErrorMessage(
            error instanceof Error ? error.message : "Failed to load owner controls"
          )
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false)
        }
      }
    }

    void loadOwnerState()

    return () => {
      cancelled = true
    }
  }, [assetAddress, signMessage, walletAddress])

  function updateLimitValue(
    period: AgentSpendingLimitPeriod,
    field: "limit" | "spent" | "resetAt",
    rawValue: string
  ) {
    setEditedLimits((currentLimits) => {
      if (!currentLimits) {
        return currentLimits
      }

      const numericValue = Number(rawValue)

      return {
        ...currentLimits,
        [period]: {
          ...currentLimits[period],
          [field]: Number.isFinite(numericValue) ? numericValue : 0,
        },
      }
    })
  }

  function updateLimitEnabled(period: AgentSpendingLimitPeriod) {
    setEditedLimits((currentLimits) => {
      if (!currentLimits) {
        return currentLimits
      }

      return {
        ...currentLimits,
        [period]: {
          ...currentLimits[period],
          enabled: !currentLimits[period].enabled,
        },
      }
    })
  }

  function updateLimitCurrency(
    period: AgentSpendingLimitPeriod,
    value: (typeof AGENT_SPENDING_LIMIT_CURRENCIES)[number]
  ) {
    setEditedLimits((currentLimits) => {
      if (!currentLimits) {
        return currentLimits
      }

      return {
        ...currentLimits,
        [period]: {
          ...currentLimits[period],
          currency: value,
        },
      }
    })
  }

  async function handleSaveLimits() {
    if (!editedLimits) {
      return
    }

    setIsSaving(true)
    setErrorMessage(null)

    try {
      const response = await signedAgentOwnerJsonRequest<
        UpdateLimitsResponse,
        {
          spendingLimits: AgentSpendingLimits
          walletAddress: string
        }
      >({
        method: "POST",
        path: "/api/agents/limits",
        signMessage,
        walletAddress,
        body: {
          walletAddress,
          spendingLimits: editedLimits,
        },
      })

      if (response.agent.spendingLimits) {
        setBudgetStatus((currentStatus) =>
          currentStatus
            ? {
                ...currentStatus,
                limits: response.agent.spendingLimits ?? currentStatus.limits,
              }
            : currentStatus
        )
        setEditedLimits(response.agent.spendingLimits)
      }

      setIsEditingLimits(false)
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Failed to update spending limits"
      )
    } finally {
      setIsSaving(false)
    }
  }

  async function handleRegenerateApiKey() {
    setIsRegenerating(true)
    setErrorMessage(null)

    try {
      const response = await signedAgentOwnerJsonRequest<
        RegenerateApiKeyResponse,
        {
          walletAddress: string
        }
      >({
        method: "POST",
        path: "/api/agents/regenerate",
        signMessage,
        walletAddress,
        body: {
          walletAddress,
        },
      })

      setLatestApiKey(response.agent.apiKey)
      setOwnerAgent((currentAgent) =>
        currentAgent
          ? {
              ...currentAgent,
              apiKeyPreview:
                response.agent.apiKeyPreview ??
                `${response.agent.apiKey.slice(0, 8)}...${response.agent.apiKey.slice(-4)}`,
            }
          : currentAgent
      )
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Failed to regenerate API key"
      )
    } finally {
      setIsRegenerating(false)
    }
  }

  async function copyLatestApiKey() {
    if (!latestApiKey) {
      return
    }

    await navigator.clipboard.writeText(latestApiKey)
  }

  return (
    <Card className="border-white/5 bg-dark-800/80 py-0 text-white">
      <CardHeader className="px-6 pt-6">
        <CardTitle className="text-xl text-white">Owner Controls</CardTitle>
        <CardDescription className="text-sm leading-6 text-white/50">
          API key and spending-limit management uses signed wallet messages and is
          only available to the agent owner.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-6 px-6 pb-6">
        {errorMessage ? (
          <div className="rounded-xl border border-red-500/20 bg-red-950/30 px-4 py-3 text-sm text-red-200">
            {errorMessage}
          </div>
        ) : null}

        {isLoading ? (
          <div className="text-sm text-white/50">Loading owner controls…</div>
        ) : null}

        {ownerAgent ? (
          <div className="space-y-4 rounded-2xl border border-white/8 bg-dark-900/65 p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl border border-gold-500/25 bg-gold-500/10 text-gold-300">
                <KeyRoundIcon className="size-5" />
              </div>
              <div>
                <p className="text-sm font-medium text-white">API key</p>
                <p className="text-xs text-white/45">
                  Existing keys are not re-exposed. Rotate to issue a new one.
                </p>
              </div>
            </div>

            <div className="rounded-xl border border-white/8 bg-dark-800/80 px-4 py-3">
              <p className="text-xs uppercase tracking-[0.2em] text-white/35">Current preview</p>
              <p className="mt-2 break-all font-mono text-sm text-white/80">
                {ownerAgent.apiKeyPreview}
              </p>
            </div>

            {latestApiKey ? (
              <div className="space-y-3 rounded-xl border border-emerald-500/20 bg-emerald-950/25 px-4 py-4">
                <p className="text-sm font-medium text-emerald-200">
                  New API key generated. Copy it now.
                </p>
                <p className="break-all rounded-lg border border-white/8 bg-dark-900/70 px-3 py-3 font-mono text-xs text-white/85">
                  {latestApiKey}
                </p>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    void copyLatestApiKey()
                  }}
                  className="border-white/10 bg-dark-900/70 text-white hover:bg-dark-900"
                >
                  <CopyIcon className="mr-2 size-4" />
                  Copy API key
                </Button>
              </div>
            ) : null}

            <Button
              type="button"
              variant="outline"
              disabled={isRegenerating}
              onClick={() => {
                void handleRegenerateApiKey()
              }}
              className="border-white/10 bg-dark-900/70 text-white hover:bg-dark-900"
            >
              <RefreshCcwIcon className="mr-2 size-4" />
              {isRegenerating ? "Regenerating…" : "Regenerate API key"}
            </Button>
          </div>
        ) : null}

        {budgetStatus ? (
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold uppercase tracking-[0.22em] text-white/45">
                  Spending limits
                </h3>
                <p className="mt-1 text-sm text-white/50">
                  Limits reset automatically using the stored reset timestamps.
                </p>
              </div>

              {!isEditingLimits ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setEditedLimits(budgetStatus.limits)
                    setIsEditingLimits(true)
                  }}
                  className="border-white/10 bg-dark-900/70 text-white hover:bg-dark-900"
                >
                  Edit limits
                </Button>
              ) : null}
            </div>

            <div className="space-y-4">
              {AGENT_SPENDING_LIMIT_PERIODS.map((period) => {
                const sourceLimits = isEditingLimits && editedLimits
                  ? editedLimits
                  : budgetStatus.limits
                const limit = sourceLimits[period]
                const progress = budgetStatus.progress[period]

                return (
                  <div
                    key={period}
                    className="space-y-4 rounded-2xl border border-white/8 bg-dark-900/65 p-4"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-medium text-white">
                          {formatLimitLabel(period)}
                        </p>
                        <p className="text-xs text-white/45">
                          {limit.enabled
                            ? `${limit.spent.toFixed(2)} / ${limit.limit.toFixed(2)} ${limit.currency}`
                            : "Disabled"}
                        </p>
                      </div>

                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={!isEditingLimits}
                        onClick={() => updateLimitEnabled(period)}
                        className="border-white/10 bg-dark-800/80 text-white hover:bg-dark-800"
                      >
                        {limit.enabled ? "Enabled" : "Disabled"}
                      </Button>
                    </div>

                    <div className="h-2 overflow-hidden rounded-full bg-dark-800">
                      <div
                        className="h-full rounded-full bg-linear-to-r from-gold-400 to-gold-600"
                        style={{ width: `${Math.min(progress, 100)}%` }}
                      />
                    </div>

                    {isEditingLimits ? (
                      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_160px]">
                        <Input
                          type="number"
                          min="0"
                          step="0.01"
                          value={limit.limit}
                          onChange={(event) =>
                            updateLimitValue(period, "limit", event.target.value)
                          }
                          className="border-white/10 bg-dark-800/80 text-white"
                        />

                        <Select
                          value={limit.currency}
                          onValueChange={(value) =>
                            updateLimitCurrency(
                              period,
                              value as (typeof AGENT_SPENDING_LIMIT_CURRENCIES)[number]
                            )
                          }
                        >
                          <SelectTrigger className="border-white/10 bg-dark-800/80 text-white">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent className="border-white/10 bg-dark-800 text-white">
                            {AGENT_SPENDING_LIMIT_CURRENCIES.map((currency) => (
                              <SelectItem key={currency} value={currency}>
                                {currency}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    ) : null}
                  </div>
                )
              })}
            </div>

            {isEditingLimits && editedLimits ? (
              <>
                <Separator className="bg-white/8" />
                <div className="flex flex-wrap gap-3">
                  <Button
                    type="button"
                    disabled={isSaving}
                    onClick={() => {
                      void handleSaveLimits()
                    }}
                    className="bg-gold-500 text-dark-900 hover:bg-gold-600"
                  >
                    {isSaving ? "Saving…" : "Save limits"}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setEditedLimits(budgetStatus.limits)
                      setIsEditingLimits(false)
                    }}
                    className="border-white/10 bg-dark-900/70 text-white hover:bg-dark-900"
                  >
                    Cancel
                  </Button>
                </div>
              </>
            ) : null}
          </div>
        ) : null}
      </CardContent>
    </Card>
  )
}