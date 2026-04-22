"use client"

import Link from "next/link"
import {
  CheckCircle2Icon,
  CopyIcon,
  ExternalLinkIcon,
  RefreshCcwIcon,
  Wallet2Icon,
} from "lucide-react"
import { useEffect, useState } from "react"
import type { Connection, PublicKey, VersionedTransaction } from "@solana/web3.js"

import { useWalletCapabilities } from "@/hooks/useWalletCapabilities"
import {
  AGENT_PERMISSION_KEYS,
  type AgentPermission,
  type AgentPermissions,
  type AgentSpendingLimits,
} from "@/lib/agents"
import { cn } from "@/lib/utils"
import { Badge } from "@/components/ui/badge"
import { Button, buttonVariants } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Separator } from "@/components/ui/separator"
import { Textarea } from "@/components/ui/textarea"

import { signedAgentOwnerJsonRequest } from "../_lib/client"
import {
  RegisterProgress,
  RegisterSelectableCard,
  RegisterStatusMetric,
} from "./_components/register-ui"
import {
  AGENT_CATEGORY_OPTIONS,
  buildRegisterSpendingLimits,
  createInitialRegisterConfigurationState,
  REGISTER_STEP_LABELS,
  type RegisterConfigurationState,
  type RegisterStep,
  toggleListValue,
} from "./_lib/form"
import {
  fetchSaidStatus,
  registerSaidOnChain,
  registerSaidProfile,
  type SaidStatus,
  verifySaidOnChain,
} from "./_lib/said"

type PendingAction =
  | "artifacte-register"
  | "said-profile"
  | "said-register"
  | "said-status"
  | "said-verify"

interface CreateAgentResponse {
  agent: {
    agentName: string
    apiKey: string
    categories: string[]
    permissions: AgentPermissions
    spendingLimits?: AgentSpendingLimits
    walletAddress: string
  }
  success: true
}

const EMPTY_SAID_STATUS: SaidStatus = {
  hasPassport: false,
  isRegistered: false,
  isVerified: false,
}

const PERMISSION_DESCRIPTIONS: Record<AgentPermission, string> = {
  Bid: "Allow the agent to place bids or make competitive offers.",
  Chat: "Allow the agent to participate in agent-to-agent or user messaging flows.",
  Trade: "Allow the agent to execute Artifacte trading actions under your configured budget.",
}

interface ConnectedAgentRegistrationContentProps {
  connection: Connection
  publicKey: PublicKey
  signMessage?: (message: Uint8Array) => Promise<Uint8Array>
  signTransaction?: <T extends VersionedTransaction>(transaction: T) => Promise<T>
  walletAddress: string
}

function getPendingLabel(pendingAction: PendingAction | null): string | null {
  switch (pendingAction) {
    case "artifacte-register":
      return "Registering with Artifacte…"
    case "said-profile":
      return "Creating SAID profile…"
    case "said-register":
      return "Submitting SAID on-chain registration…"
    case "said-status":
      return "Checking SAID status…"
    case "said-verify":
      return "Submitting SAID verification…"
    default:
      return null
  }
}

function formatWalletPreview(walletAddress: string): string {
  return `${walletAddress.slice(0, 8)}...${walletAddress.slice(-8)}`
}

export function AgentRegistrationContent() {
  const {
    connected,
    connection,
    publicKey,
    signMessage,
    signTransaction,
  } = useWalletCapabilities()

  if (!connected || !publicKey) {
    return (
      <main className="min-h-screen bg-dark-900 pb-20 pt-32">
        <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
          <Card className="border-white/5 bg-dark-800/80 py-0 text-white">
            <CardHeader className="px-8 pt-8 text-center">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-3xl border border-gold-500/20 bg-gold-500/10 text-gold-200">
                <Wallet2Icon className="size-7" />
              </div>
              <CardTitle className="font-serif text-3xl text-white">
                Connect a wallet to register your agent
              </CardTitle>
              <CardDescription className="text-base leading-7 text-white/55">
                The register flow now uses signed wallet messages for Artifacte access and
                keeps the SAID transaction boundary isolated to a dedicated Solana helper.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6 px-8 pb-8 text-sm leading-7 text-white/60">
              <div className="rounded-3xl border border-white/8 bg-dark-900/65 p-6">
                Connect the owner wallet first. Once connected, this route will check SAID
                status, let you complete any missing SAID steps, and then create your
                Artifacte API key with a signed owner request.
              </div>
            </CardContent>
          </Card>
        </div>
      </main>
    )
  }

  return (
    <ConnectedAgentRegistrationContent
      connection={connection}
      key={publicKey.toBase58()}
      publicKey={publicKey}
      signMessage={signMessage}
      signTransaction={signTransaction}
      walletAddress={publicKey.toBase58()}
    />
  )
}

function ConnectedAgentRegistrationContent({
  connection,
  publicKey,
  signMessage,
  signTransaction,
  walletAddress,
}: ConnectedAgentRegistrationContentProps) {
  const [agentDescription, setAgentDescription] = useState("")
  const [agentName, setAgentName] = useState("")
  const [configuration, setConfiguration] = useState<RegisterConfigurationState>(
    () => createInitialRegisterConfigurationState()
  )
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [generatedApiKey, setGeneratedApiKey] = useState<string | null>(null)
  const [pendingAction, setPendingAction] = useState<PendingAction | null>("said-status")
  const [saidStatus, setSaidStatus] = useState<SaidStatus>(EMPTY_SAID_STATUS)
  const [step, setStep] = useState<RegisterStep>(2)

  useEffect(() => {
    let cancelled = false

    async function loadSaidState() {
      try {
        const nextStatus = await fetchSaidStatus(walletAddress)

        if (cancelled) {
          return
        }

        setAgentDescription(nextStatus.description ?? "")
        setAgentName(nextStatus.name ?? "")
        setSaidStatus(nextStatus)
        setStep(nextStatus.isRegistered ? 4 : 2)
      } catch {
        if (!cancelled) {
          setSaidStatus(EMPTY_SAID_STATUS)
          setStep(2)
        }
      } finally {
        if (!cancelled) {
          setPendingAction(null)
        }
      }
    }

    void loadSaidState()

    return () => {
      cancelled = true
    }
  }, [walletAddress])

  const selectedStepLabel = REGISTER_STEP_LABELS[step]
  const pendingLabel = getPendingLabel(pendingAction)
  const isBusy = pendingAction !== null
  const budgetValue = Number(configuration.dailyBudget)
  const isBudgetValid =
    !configuration.budgetEnabled ||
    (Number.isFinite(budgetValue) && budgetValue > 0)
  const canSubmitArtifacteRegistration =
    Boolean(walletAddress) &&
    Boolean(signMessage) &&
    agentName.trim().length > 0 &&
    configuration.categories.length > 0 &&
    isBudgetValid

  async function handleRefreshStatus() {
    if (!walletAddress) {
      return
    }

    setPendingAction("said-status")
    setErrorMessage(null)

    try {
      const nextStatus = await fetchSaidStatus(walletAddress)
      setAgentDescription((currentValue) =>
        currentValue.trim().length > 0 ? currentValue : nextStatus.description ?? ""
      )
      setAgentName((currentValue) =>
        currentValue.trim().length > 0 ? currentValue : nextStatus.name ?? ""
      )
      setSaidStatus(nextStatus)
      setStep(nextStatus.isRegistered ? 4 : 2)
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Failed to refresh SAID status"
      )
    } finally {
      setPendingAction(null)
    }
  }

  async function handleCreateSaidProfile() {
    if (!walletAddress || !agentName.trim() || !agentDescription.trim()) {
      setErrorMessage("Please provide an agent name and description before continuing.")
      return
    }

    setPendingAction("said-profile")
    setErrorMessage(null)

    try {
      await registerSaidProfile({
        description: agentDescription.trim(),
        name: agentName.trim(),
        walletAddress,
      })

      setSaidStatus((currentStatus) => ({
        ...currentStatus,
        description: agentDescription.trim(),
        isRegistered: true,
        name: agentName.trim(),
      }))
      setStep(4)
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Failed to create SAID profile"
      )
    } finally {
      setPendingAction(null)
    }
  }

  async function handleSaidOnChainRegistration() {
    if (!publicKey || !signTransaction) {
      setErrorMessage("This wallet cannot sign transactions required for SAID on-chain setup.")
      return
    }

    setPendingAction("said-register")
    setErrorMessage(null)

    try {
      await registerSaidOnChain({
        connection,
        owner: publicKey,
        signTransaction,
      })
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? `SAID on-chain registration failed: ${error.message}`
          : "SAID on-chain registration failed"
      )
    } finally {
      setPendingAction(null)
    }
  }

  async function handleSaidVerification() {
    if (!publicKey || !signTransaction) {
      setErrorMessage("This wallet cannot sign transactions required for SAID verification.")
      return
    }

    setPendingAction("said-verify")
    setErrorMessage(null)

    try {
      await verifySaidOnChain({
        connection,
        owner: publicKey,
        signTransaction,
      })

      setSaidStatus((currentStatus) => ({
        ...currentStatus,
        isVerified: true,
      }))
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? `SAID verification failed: ${error.message}`
          : "SAID verification failed"
      )
    } finally {
      setPendingAction(null)
    }
  }

  async function handleArtifacteRegistration() {
    if (!walletAddress || !signMessage) {
      setErrorMessage("Wallet message signing is required to create an Artifacte agent API key.")
      return
    }

    if (!canSubmitArtifacteRegistration) {
      setErrorMessage("Choose at least one category and provide a valid starting budget.")
      return
    }

    setPendingAction("artifacte-register")
    setErrorMessage(null)

    try {
      const response = await signedAgentOwnerJsonRequest<
        CreateAgentResponse,
        {
          agentName: string
          categories: string[]
          description: string
          permissions: AgentPermissions
          saidVerified: boolean
          spendingLimits?: AgentSpendingLimits
          walletAddress: string
        }
      >({
        body: {
          agentName: agentName.trim(),
          categories: configuration.categories,
          description: agentDescription.trim(),
          permissions: configuration.permissions,
          saidVerified: saidStatus.isVerified,
          spendingLimits: buildRegisterSpendingLimits(configuration),
          walletAddress,
        },
        method: "POST",
        path: "/api/agents",
        signMessage,
        walletAddress,
      })

      setGeneratedApiKey(response.agent.apiKey)
      setStep(5)
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Failed to register agent with Artifacte"
      )
    } finally {
      setPendingAction(null)
    }
  }

  async function handleCopyApiKey() {
    if (!generatedApiKey) {
      return
    }

    try {
      await navigator.clipboard.writeText(generatedApiKey)
    } catch {
      setErrorMessage("Failed to copy the API key. Copy it manually before leaving this page.")
    }
  }

  function toggleCategory(category: string) {
    setConfiguration((currentValue) => ({
      ...currentValue,
      categories: toggleListValue(currentValue.categories, category),
    }))
  }

  function togglePermission(permission: AgentPermission) {
    setConfiguration((currentValue) => ({
      ...currentValue,
      permissions: {
        ...currentValue.permissions,
        [permission]: !currentValue.permissions[permission],
      },
    }))
  }

  function resetLocalState() {
    setConfiguration(createInitialRegisterConfigurationState())
    setErrorMessage(null)
    setGeneratedApiKey(null)
    setStep(saidStatus.isRegistered ? 4 : 2)
  }

  return (
    <main className="min-h-screen bg-dark-900 pb-20 pt-24">
      <div className="mx-auto max-w-6xl space-y-8 px-4 sm:px-6 lg:px-8">
        <section className="space-y-4 text-center">
          <Badge className="border-gold-500/20 bg-gold-500/10 px-3 py-1 text-gold-100" variant="outline">
            Agents • Registration
          </Badge>
          <div className="space-y-3">
            <h1 className="font-serif text-4xl text-white md:text-5xl">
              Register an Artifacte agent
            </h1>
            <p className="mx-auto max-w-3xl text-base leading-7 text-white/55 md:text-lg">
              Create or sync a SAID profile, optionally complete the SAID on-chain
              verification path, then mint an Artifacte API key with explicit permissions
              and a signed owner request.
            </p>
          </div>
        </section>

        <RegisterProgress step={step} />

        {errorMessage ? (
          <div className="rounded-2xl border border-red-500/20 bg-red-950/30 px-5 py-4 text-sm text-red-100">
            {errorMessage}
          </div>
        ) : null}

        <section className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_320px] lg:items-start">
          <Card className="border-white/5 bg-dark-800/80 py-0 text-white">
            <CardHeader className="space-y-3 px-6 pt-6">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-gold-300">
                    Current step
                  </p>
                  <CardTitle className="mt-2 font-serif text-2xl text-white">
                    {selectedStepLabel}
                  </CardTitle>
                </div>

                <Button
                  className="border-white/10 bg-dark-900/65 text-white hover:bg-dark-900"
                  disabled={pendingAction === "said-status"}
                  onClick={handleRefreshStatus}
                  type="button"
                  variant="outline"
                >
                  <RefreshCcwIcon className="size-4" />
                  Refresh SAID status
                </Button>
              </div>

              {pendingLabel ? (
                <CardDescription className="text-sm leading-6 text-white/55">
                  {pendingLabel}
                </CardDescription>
              ) : null}
            </CardHeader>

            <CardContent className="space-y-8 px-6 pb-6">
              <section className="space-y-4 rounded-3xl border border-white/8 bg-dark-900/65 p-5">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-white/40">
                      Owner wallet
                    </p>
                    <p className="mt-2 break-all font-mono text-sm text-white/80">
                      {walletAddress}
                    </p>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <Badge
                      className={cn(
                        "px-2 py-1",
                        signMessage
                          ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-100"
                          : "border-red-500/20 bg-red-500/10 text-red-100"
                      )}
                      variant="outline"
                    >
                      {signMessage ? "Message signing ready" : "No message signing"}
                    </Badge>
                    <Badge
                      className={cn(
                        "px-2 py-1",
                        signTransaction
                          ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-100"
                          : "border-red-500/20 bg-red-500/10 text-red-100"
                      )}
                      variant="outline"
                    >
                      {signTransaction ? "Transaction signing ready" : "No transaction signing"}
                    </Badge>
                  </div>
                </div>
              </section>

              <section className="space-y-4">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-gold-300">
                      SAID protocol
                    </p>
                    <h2 className="mt-2 font-serif text-2xl text-white">Registration status</h2>
                  </div>
                </div>

                <div className="grid gap-4 md:grid-cols-3">
                  <RegisterStatusMetric
                    label="Profile registered"
                    statusLabel={saidStatus.isRegistered ? "Ready" : "Missing"}
                    tone={saidStatus.isRegistered ? "success" : "danger"}
                  />
                  <RegisterStatusMetric
                    label="Verified"
                    statusLabel={saidStatus.isVerified ? "Complete" : "Optional"}
                    tone={saidStatus.isVerified ? "success" : "warning"}
                  />
                  <RegisterStatusMetric
                    label="Passport"
                    statusLabel={saidStatus.hasPassport ? "Present" : "Not found"}
                    tone={saidStatus.hasPassport ? "success" : "warning"}
                  />
                </div>

                {!saidStatus.isRegistered && step === 2 ? (
                  <div className="flex flex-wrap gap-3">
                    <Button
                      className="bg-gold-500 text-dark-950 hover:bg-gold-400"
                      onClick={() => setStep(3)}
                      type="button"
                    >
                      Create SAID profile
                    </Button>
                  </div>
                ) : null}

                {saidStatus.isRegistered && !saidStatus.isVerified ? (
                  <div className="space-y-4 rounded-3xl border border-white/8 bg-dark-900/65 p-5">
                    <div className="space-y-2">
                      <p className="text-sm font-medium text-white">
                        Optional: complete the SAID on-chain path
                      </p>
                      <p className="text-sm leading-6 text-white/55">
                        If your agent is already registered off-chain, you can still perform the
                        SAID on-chain registration and verification transactions from this page.
                      </p>
                    </div>

                    <div className="flex flex-wrap gap-3">
                      <Button
                        className="border-gold-500/30 bg-transparent text-gold-200 hover:bg-gold-500/10"
                        disabled={!signTransaction || isBusy}
                        onClick={handleSaidOnChainRegistration}
                        type="button"
                        variant="outline"
                      >
                        Register on-chain
                      </Button>
                      <Button
                        className="bg-gold-500 text-dark-950 hover:bg-gold-400"
                        disabled={!signTransaction || isBusy}
                        onClick={handleSaidVerification}
                        type="button"
                      >
                        Verify on-chain
                      </Button>
                    </div>

                    {!signTransaction ? (
                      <p className="text-sm leading-6 text-white/45">
                        Switch to a wallet that supports transaction signing to run these SAID
                        transactions.
                      </p>
                    ) : null}
                  </div>
                ) : null}
              </section>

              {step === 3 ? (
                <section className="space-y-5 rounded-3xl border border-white/8 bg-dark-900/65 p-5">
                  <div className="space-y-2">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-gold-300">
                      SAID profile
                    </p>
                    <h2 className="font-serif text-2xl text-white">Create your public identity</h2>
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-medium text-white/80" htmlFor="agent-name">
                      Agent name
                    </label>
                    <Input
                      className="border-white/10 bg-dark-800/80 text-white"
                      id="agent-name"
                      onChange={(event) => setAgentName(event.target.value)}
                      placeholder="e.g. ArtCollector Bot"
                      value={agentName}
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-medium text-white/80" htmlFor="agent-description">
                      Description
                    </label>
                    <Textarea
                      className="min-h-32 border-white/10 bg-dark-800/80 text-white"
                      id="agent-description"
                      onChange={(event) => setAgentDescription(event.target.value)}
                      placeholder="Describe what this agent does and how it should operate."
                      value={agentDescription}
                    />
                  </div>

                  <div className="flex flex-wrap gap-3">
                    <Button
                      className="bg-gold-500 text-dark-950 hover:bg-gold-400"
                      disabled={isBusy || !agentName.trim() || !agentDescription.trim()}
                      onClick={handleCreateSaidProfile}
                      type="button"
                    >
                      Create SAID profile
                    </Button>
                    <Button
                      className="border-white/10 bg-transparent text-white hover:bg-dark-800"
                      onClick={() => setStep(2)}
                      type="button"
                      variant="outline"
                    >
                      Back
                    </Button>
                  </div>
                </section>
              ) : null}

              {step >= 4 && saidStatus.isRegistered ? (
                <section className="space-y-6 rounded-3xl border border-white/8 bg-dark-900/65 p-5">
                  <div className="space-y-2">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-gold-300">
                      Artifacte access
                    </p>
                    <h2 className="font-serif text-2xl text-white">Configure permissions</h2>
                    <p className="text-sm leading-6 text-white/55">
                      This step creates or replaces the owner wallet’s local Artifacte agent
                      record and issues a new API key.
                    </p>
                  </div>

                  <div className="grid gap-5 lg:grid-cols-2">
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-white/80" htmlFor="artifacte-agent-name">
                        Agent name
                      </label>
                      <Input
                        className="border-white/10 bg-dark-800/80 text-white"
                        id="artifacte-agent-name"
                        onChange={(event) => setAgentName(event.target.value)}
                        value={agentName}
                      />
                    </div>

                    <div className="space-y-2">
                      <label className="text-sm font-medium text-white/80" htmlFor="artifacte-budget">
                        Starting daily budget (USD1)
                      </label>
                      <Input
                        className="border-white/10 bg-dark-800/80 text-white"
                        disabled={!configuration.budgetEnabled}
                        id="artifacte-budget"
                        min="1"
                        onChange={(event) =>
                          setConfiguration((currentValue) => ({
                            ...currentValue,
                            dailyBudget: event.target.value,
                          }))
                        }
                        type="number"
                        value={configuration.dailyBudget}
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-medium text-white/80" htmlFor="artifacte-description">
                      Description
                    </label>
                    <Textarea
                      className="min-h-28 border-white/10 bg-dark-800/80 text-white"
                      id="artifacte-description"
                      onChange={(event) => setAgentDescription(event.target.value)}
                      value={agentDescription}
                    />
                  </div>

                  <div className="space-y-3">
                    <div className="flex items-center justify-between gap-4">
                      <div>
                        <p className="text-sm font-medium text-white">Budget policy</p>
                        <p className="text-sm leading-6 text-white/55">
                          Start with a daily USD1 budget now and fine-tune weekly or monthly caps
                          later from the owner controls panel.
                        </p>
                      </div>

                      <Button
                        className={cn(
                          configuration.budgetEnabled
                            ? "bg-gold-500 text-dark-950 hover:bg-gold-400"
                            : "border-white/10 bg-transparent text-white hover:bg-dark-800"
                        )}
                        onClick={() =>
                          setConfiguration((currentValue) => ({
                            ...currentValue,
                            budgetEnabled: !currentValue.budgetEnabled,
                          }))
                        }
                        type="button"
                        variant={configuration.budgetEnabled ? "default" : "outline"}
                      >
                        {configuration.budgetEnabled ? "Budget enabled" : "Budget disabled"}
                      </Button>
                    </div>
                  </div>

                  <Separator className="bg-white/8" />

                  <div className="space-y-4">
                    <div>
                      <p className="text-sm font-medium text-white">Categories</p>
                      <p className="text-sm leading-6 text-white/55">
                        Choose the areas this agent should appear in publicly and be allowed to
                        operate against.
                      </p>
                    </div>

                    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                      {AGENT_CATEGORY_OPTIONS.map((category) => (
                        <RegisterSelectableCard
                          description="Expose this agent for this trading category."
                          key={category}
                          label={category}
                          onToggle={() => toggleCategory(category)}
                          selected={configuration.categories.includes(category)}
                        />
                      ))}
                    </div>
                  </div>

                  <Separator className="bg-white/8" />

                  <div className="space-y-4">
                    <div>
                      <p className="text-sm font-medium text-white">Permissions</p>
                      <p className="text-sm leading-6 text-white/55">
                        These flags describe what the Artifacte agent is allowed to do once the API
                        key is in use.
                      </p>
                    </div>

                    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                      {AGENT_PERMISSION_KEYS.map((permission) => (
                        <RegisterSelectableCard
                          description={PERMISSION_DESCRIPTIONS[permission]}
                          key={permission}
                          label={permission}
                          onToggle={() => togglePermission(permission)}
                          selected={configuration.permissions[permission]}
                        />
                      ))}
                    </div>
                  </div>

                  {!signMessage ? (
                    <div className="rounded-2xl border border-red-500/20 bg-red-950/30 px-4 py-4 text-sm leading-6 text-red-100">
                      This wallet does not support message signing. Switch wallets before creating
                      the Artifacte API key.
                    </div>
                  ) : null}

                  <div className="flex flex-wrap gap-3">
                    <Button
                      className="bg-gold-500 text-dark-950 hover:bg-gold-400"
                      disabled={isBusy || !canSubmitArtifacteRegistration}
                      onClick={handleArtifacteRegistration}
                      type="button"
                    >
                      Create Artifacte API key
                    </Button>
                  </div>
                </section>
              ) : null}

              {step === 5 && generatedApiKey ? (
                <section className="space-y-6 rounded-3xl border border-gold-500/20 bg-gold-500/6 p-5">
                  <div className="flex items-start gap-4">
                    <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-gold-500/25 bg-gold-500/15 text-gold-100">
                      <CheckCircle2Icon className="size-6" />
                    </div>
                    <div className="space-y-2">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-gold-300">
                        Setup complete
                      </p>
                      <h2 className="font-serif text-2xl text-white">Your agent is registered</h2>
                      <p className="text-sm leading-6 text-white/65">
                        Save the API key now. Existing keys are never re-shown after you leave this
                        page; rotating it later will invalidate the current one.
                      </p>
                    </div>
                  </div>

                  <div className="grid gap-4 lg:grid-cols-2">
                    <div className="rounded-2xl border border-white/8 bg-dark-900/65 p-4">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-white/40">
                        SAID identity
                      </p>
                      <div className="mt-3 space-y-2 text-sm text-white/70">
                        <p>
                          <span className="text-white/45">Wallet:</span> {formatWalletPreview(walletAddress)}
                        </p>
                        <p>
                          <span className="text-white/45">Name:</span> {agentName}
                        </p>
                        <p>
                          <span className="text-white/45">Verified:</span>{" "}
                          {saidStatus.isVerified ? "Yes" : "Not yet"}
                        </p>
                      </div>
                    </div>

                    <div className="rounded-2xl border border-white/8 bg-dark-900/65 p-4">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-white/40">
                        Artifacte access
                      </p>
                      <div className="mt-3 flex flex-wrap gap-2">
                        {configuration.categories.map((category) => (
                          <Badge
                            className="border-white/10 bg-white/5 text-white/70"
                            key={category}
                            variant="outline"
                          >
                            {category}
                          </Badge>
                        ))}
                      </div>
                      <div className="mt-3 flex flex-wrap gap-2">
                        {AGENT_PERMISSION_KEYS.map((permission) => (
                          <Badge
                            className={cn(
                              configuration.permissions[permission]
                                ? "border-gold-500/20 bg-gold-500/10 text-gold-100"
                                : "border-white/10 bg-white/5 text-white/35"
                            )}
                            key={permission}
                            variant="outline"
                          >
                            {permission}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="rounded-2xl border border-white/8 bg-dark-900/80 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-white/40">
                          API key
                        </p>
                        <p className="mt-2 break-all font-mono text-sm text-white/90">
                          {generatedApiKey}
                        </p>
                      </div>

                      <Button
                        className="border-white/10 bg-transparent text-white hover:bg-dark-800"
                        onClick={handleCopyApiKey}
                        type="button"
                        variant="outline"
                      >
                        <CopyIcon className="size-4" />
                        Copy key
                      </Button>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-3">
                    <Link
                      className={cn(
                        buttonVariants({ variant: "outline" }),
                        "border-gold-500/25 bg-transparent text-gold-100 hover:bg-gold-500/10"
                      )}
                      href="https://directory.saidprotocol.com"
                      rel="noopener noreferrer"
                      target="_blank"
                    >
                      View SAID directory
                      <ExternalLinkIcon className="size-4" />
                    </Link>
                    <Link
                      className={cn(
                        buttonVariants({ variant: "outline" }),
                        "border-white/10 bg-transparent text-white hover:bg-dark-800"
                      )}
                      href="/agents"
                    >
                      View agents
                    </Link>
                    <Button
                      className="border-white/10 bg-transparent text-white hover:bg-dark-800"
                      onClick={resetLocalState}
                      type="button"
                      variant="outline"
                    >
                      Reset form
                    </Button>
                  </div>
                </section>
              ) : null}
            </CardContent>
          </Card>

          <div className="space-y-6 lg:sticky lg:top-28">
            <Card className="border-white/5 bg-dark-800/80 py-0 text-white">
              <CardHeader className="px-6 pt-6">
                <CardTitle className="font-serif text-xl text-white">Flow notes</CardTitle>
                <CardDescription className="text-sm leading-6 text-white/55">
                  This route now uses signed owner requests for Artifacte registration and keeps
                  the SAID on-chain calls behind a single helper module.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4 px-6 pb-6 text-sm leading-6 text-white/60">
                <div className="rounded-2xl border border-white/8 bg-dark-900/65 p-4">
                  SAID profile creation is free and off-chain. Verification remains optional and
                  requires transaction signing.
                </div>
                <div className="rounded-2xl border border-white/8 bg-dark-900/65 p-4">
                  Artifacte registration always replaces the existing record for this owner wallet
                  and issues a fresh API key.
                </div>
                <div className="rounded-2xl border border-white/8 bg-dark-900/65 p-4">
                  The starting budget initializes the daily limit only. Weekly and monthly caps can
                  be edited later from the owner controls panel on the agent detail page.
                </div>
              </CardContent>
            </Card>

            <Card className="border-white/5 bg-dark-800/80 py-0 text-white">
              <CardHeader className="px-6 pt-6">
                <CardTitle className="font-serif text-xl text-white">Current owner</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 px-6 pb-6 text-sm text-white/65">
                <p className="break-all font-mono text-xs text-white/80">{walletAddress}</p>
                <p>
                  Connected wallet capabilities:
                </p>
                <div className="flex flex-wrap gap-2">
                  <Badge
                    className={cn(
                      signMessage
                        ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-100"
                        : "border-red-500/20 bg-red-500/10 text-red-100"
                    )}
                    variant="outline"
                  >
                    {signMessage ? "Can sign messages" : "Cannot sign messages"}
                  </Badge>
                  <Badge
                    className={cn(
                      signTransaction
                        ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-100"
                        : "border-red-500/20 bg-red-500/10 text-red-100"
                    )}
                    variant="outline"
                  >
                    {signTransaction ? "Can sign transactions" : "Cannot sign transactions"}
                  </Badge>
                </div>
              </CardContent>
            </Card>
          </div>
        </section>
      </div>
    </main>
  )
}