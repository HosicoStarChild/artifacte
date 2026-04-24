import {
  DEFAULT_AGENT_PERMISSIONS,
  type AgentPermissions,
  type AgentSpendingLimits,
} from "@/lib/agents"

export const AGENT_CATEGORY_OPTIONS = [
  "TCG Cards",
  "Sports Cards",
  "Sealed Product",
  "Spirits",
  "Digital Art",
  "Merchandise",
] as const

export type RegisterStep = 1 | 2 | 3 | 4 | 5

export const REGISTER_STEP_LABELS: Record<RegisterStep, string> = {
  1: "Connect wallet",
  2: "Review SAID status",
  3: "Create SAID profile",
  4: "Configure Artifacte access",
  5: "Finish setup",
}

export interface RegisterConfigurationState {
  budgetEnabled: boolean
  categories: string[]
  dailyBudget: string
  permissions: AgentPermissions
}

export function createInitialRegisterConfigurationState(): RegisterConfigurationState {
  return {
    budgetEnabled: true,
    categories: [],
    dailyBudget: "100",
    permissions: {
      ...DEFAULT_AGENT_PERMISSIONS,
      Trade: true,
    },
  }
}

function getNextUtcMidnight(from = Date.now()): number {
  const nextDay = new Date(from)
  nextDay.setUTCDate(nextDay.getUTCDate() + 1)
  nextDay.setUTCHours(0, 0, 0, 0)

  return nextDay.getTime()
}

function getNextUtcMonday(from = Date.now()): number {
  const currentDate = new Date(from)
  const currentDay = currentDate.getUTCDay()
  const daysUntilMonday = currentDay === 0 ? 1 : 8 - currentDay
  const nextMonday = new Date(currentDate)
  nextMonday.setUTCDate(nextMonday.getUTCDate() + daysUntilMonday)
  nextMonday.setUTCHours(0, 0, 0, 0)

  return nextMonday.getTime()
}

function getFirstOfNextUtcMonth(from = Date.now()): number {
  const currentDate = new Date(from)

  return Date.UTC(
    currentDate.getUTCFullYear(),
    currentDate.getUTCMonth() + 1,
    1,
    0,
    0,
    0,
    0
  )
}

export function buildRegisterSpendingLimits(
  configuration: Pick<RegisterConfigurationState, "budgetEnabled" | "dailyBudget">
): AgentSpendingLimits | undefined {
  if (!configuration.budgetEnabled) {
    return undefined
  }

  const dailyLimit = Number(configuration.dailyBudget)

  if (!Number.isFinite(dailyLimit) || dailyLimit <= 0) {
    return undefined
  }

  return {
    daily: {
      enabled: true,
      currency: "USD1",
      limit: dailyLimit,
      resetAt: getNextUtcMidnight(),
      spent: 0,
    },
    monthly: {
      enabled: false,
      currency: "USD1",
      limit: 0,
      resetAt: getFirstOfNextUtcMonth(),
      spent: 0,
    },
    weekly: {
      enabled: false,
      currency: "USD1",
      limit: 0,
      resetAt: getNextUtcMonday(),
      spent: 0,
    },
  }
}

export function toggleListValue(values: string[], value: string): string[] {
  return values.includes(value)
    ? values.filter((entry) => entry !== value)
    : [...values, value]
}