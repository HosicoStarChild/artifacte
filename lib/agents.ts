export const AGENT_PERMISSION_KEYS = ["Trade", "Bid", "Chat"] as const

export const AGENT_CONNECTION_STATUSES = ["connected", "disconnected"] as const

export const AGENT_SPENDING_LIMIT_PERIODS = ["daily", "weekly", "monthly"] as const

export const AGENT_SPENDING_LIMIT_CURRENCIES = ["SOL", "USD1"] as const

export type AgentPermission = (typeof AGENT_PERMISSION_KEYS)[number]

export type AgentConnectionStatus = (typeof AGENT_CONNECTION_STATUSES)[number]

export type AgentSpendingLimitPeriod = (typeof AGENT_SPENDING_LIMIT_PERIODS)[number]

export type AgentSpendingLimitCurrency = (typeof AGENT_SPENDING_LIMIT_CURRENCIES)[number]

export interface AgentService {
  type: string
  value: string
}

export type AgentPermissions = Record<AgentPermission, boolean>

export interface AgentSpendingLimit {
  enabled: boolean
  limit: number
  currency: AgentSpendingLimitCurrency
  spent: number
  resetAt: number
}

export type AgentSpendingLimits = Record<
  AgentSpendingLimitPeriod,
  AgentSpendingLimit
>

export interface AgentRecord {
  walletAddress: string
  agentName: string
  apiKey: string
  nftMint: string
  agentAssetAddress?: string
  description?: string
  imageUri?: string
  permissions: AgentPermissions
  categories: string[]
  createdAt: number
  connectionStatus: AgentConnectionStatus
  saidVerified?: boolean
  services?: AgentService[]
  spendingLimits?: AgentSpendingLimits
}

export interface PublicAgentRecord {
  walletAddress: string
  agentName: string
  nftMint: string
  agentAssetAddress?: string
  description?: string
  imageUri?: string
  permissions: AgentPermissions
  categories: string[]
  createdAt: number
  connectionStatus: AgentConnectionStatus
  saidVerified: boolean
  services: AgentService[]
  hasSpendingLimits: boolean
}

export interface OwnerAgentRecord extends PublicAgentRecord {
  apiKeyPreview: string
}

export interface OwnerAgentSecretRecord extends OwnerAgentRecord {
  apiKey: string
}

export interface AgentBudgetStatus {
  limits: AgentSpendingLimits
  progress: Record<AgentSpendingLimitPeriod, number>
}

export interface AgentsData {
  agents: Record<string, AgentRecord>
}

export const DEFAULT_AGENT_PERMISSIONS: AgentPermissions = {
  Bid: false,
  Chat: false,
  Trade: false,
}

export const DEFAULT_AGENT_CATEGORY = "Digital Art"

export function isAgentSpendingLimitCurrency(
  value: string
): value is AgentSpendingLimitCurrency {
  return AGENT_SPENDING_LIMIT_CURRENCIES.includes(
    value as AgentSpendingLimitCurrency
  )
}

export function isAgentConnectionStatus(
  value: string
): value is AgentConnectionStatus {
  return AGENT_CONNECTION_STATUSES.includes(value as AgentConnectionStatus)
}

export function toApiKeyPreview(apiKey: string): string {
  if (apiKey.length <= 12) {
    return apiKey
  }

  return `${apiKey.slice(0, 8)}...${apiKey.slice(-4)}`
}

export function normalizeAgentCategories(categories: string[]): string[] {
  const normalized = categories
    .map((category) => category.trim())
    .filter((category) => category.length > 0)

  return normalized.length > 0
    ? Array.from(new Set(normalized))
    : [DEFAULT_AGENT_CATEGORY]
}

export function normalizeAgentPermissions(
  permissions?: Partial<Record<AgentPermission, boolean>>
): AgentPermissions {
  return {
    Bid: Boolean(permissions?.Bid),
    Chat: Boolean(permissions?.Chat),
    Trade: Boolean(permissions?.Trade),
  }
}

export function normalizeAgentServices(
  services?: AgentService[]
): AgentService[] {
  return services?.filter(
    (service) => service.type.trim().length > 0 && service.value.trim().length > 0
  ) ?? []
}

export function toPublicAgentRecord(record: AgentRecord): PublicAgentRecord {
  return {
    walletAddress: record.walletAddress,
    agentName: record.agentName,
    nftMint: record.nftMint,
    agentAssetAddress: record.agentAssetAddress,
    description: record.description,
    imageUri: record.imageUri,
    permissions: normalizeAgentPermissions(record.permissions),
    categories: normalizeAgentCategories(record.categories),
    createdAt: record.createdAt,
    connectionStatus: isAgentConnectionStatus(record.connectionStatus)
      ? record.connectionStatus
      : "disconnected",
    saidVerified: Boolean(record.saidVerified),
    services: normalizeAgentServices(record.services),
    hasSpendingLimits: Boolean(record.spendingLimits),
  }
}

export function toOwnerAgentRecord(record: AgentRecord): OwnerAgentRecord {
  return {
    ...toPublicAgentRecord(record),
    apiKeyPreview: toApiKeyPreview(record.apiKey),
  }
}

export function toOwnerAgentSecretRecord(
  record: AgentRecord
): OwnerAgentSecretRecord {
  return {
    ...toOwnerAgentRecord(record),
    apiKey: record.apiKey,
  }
}

export function isValidAgentAmount(value: number): boolean {
  return Number.isFinite(value) && value >= 0
}
