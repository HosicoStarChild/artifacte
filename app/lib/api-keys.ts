import crypto from "crypto";
import fs from "fs";
import path from "path";

const DATA_DIR = path.join(process.cwd(), "data");
const AGENTS_FILE = path.join(DATA_DIR, "agents.json");

export interface SpendingLimit {
  enabled: boolean;
  limit: number;
  currency: "SOL" | "USD1";
  spent: number;
  resetAt: number;
}

export interface SpendingLimits {
  daily: SpendingLimit;
  weekly: SpendingLimit;
  monthly: SpendingLimit;
}

export interface AgentRecord {
  walletAddress: string;
  agentName: string;
  apiKey: string;
  nftMint: string;
  agentAssetAddress?: string; // 8004 agent asset address
  permissions: {
    Trade: boolean;
    Bid: boolean;
    Chat: boolean;
  };
  categories: string[];
  createdAt: number;
  connectionStatus: "connected" | "disconnected";
  spendingLimits?: SpendingLimits;
}

interface AgentsData {
  agents: Record<string, AgentRecord>;
}

/**
 * Generate a unique API key
 */
export function generateApiKey(): string {
  const randomHex = crypto.randomBytes(32).toString("hex");
  return `art_agent_${randomHex}`;
}

/**
 * Ensure data directory exists
 */
function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

/**
 * Load agents from JSON file
 */
function loadAgents(): AgentsData {
  ensureDataDir();
  if (fs.existsSync(AGENTS_FILE)) {
    try {
      const data = fs.readFileSync(AGENTS_FILE, "utf-8");
      return JSON.parse(data);
    } catch (e) {
      console.error("Failed to load agents file:", e);
      return { agents: {} };
    }
  }
  return { agents: {} };
}

/**
 * Save agents to JSON file
 */
function saveAgents(data: AgentsData) {
  ensureDataDir();
  fs.writeFileSync(AGENTS_FILE, JSON.stringify(data, null, 2));
}

/**
 * Create default spending limits (all disabled)
 */
export function createDefaultSpendingLimits(): SpendingLimits {
  const now = Date.now();
  const tomorrow = now + 24 * 60 * 60 * 1000;
  const nextMonday = getNextMonday(now);
  const nextMonth = getFirstOfNextMonth(now);

  return {
    daily: {
      enabled: false,
      limit: 0,
      currency: "SOL",
      spent: 0,
      resetAt: tomorrow,
    },
    weekly: {
      enabled: false,
      limit: 0,
      currency: "SOL",
      spent: 0,
      resetAt: nextMonday,
    },
    monthly: {
      enabled: false,
      limit: 0,
      currency: "SOL",
      spent: 0,
      resetAt: nextMonth,
    },
  };
}

/**
 * Get next Monday midnight UTC
 */
function getNextMonday(from: number = Date.now()): number {
  const date = new Date(from);
  const day = date.getUTCDay();
  const daysUntilMonday = day === 0 ? 1 : 8 - day;
  const nextMonday = new Date(date);
  nextMonday.setUTCDate(nextMonday.getUTCDate() + daysUntilMonday);
  nextMonday.setUTCHours(0, 0, 0, 0);
  return nextMonday.getTime();
}

/**
 * Get first of next month midnight UTC
 */
function getFirstOfNextMonth(from: number = Date.now()): number {
  const date = new Date(from);
  const nextMonth = new Date(
    date.getUTCFullYear(),
    date.getUTCMonth() + 1,
    1,
    0,
    0,
    0,
    0
  );
  return nextMonth.getTime();
}

/**
 * Register a new agent API key
 */
export function registerAgentApiKey(
  walletAddress: string,
  agentName: string,
  apiKey: string,
  nftMint: string,
  permissions: { Trade: boolean; Bid: boolean; Chat: boolean },
  categories: string[] = [],
  spendingLimits?: SpendingLimits,
  agentAssetAddress?: string
): AgentRecord {
  const data = loadAgents();

  const record: AgentRecord = {
    walletAddress,
    agentName,
    apiKey,
    nftMint,
    agentAssetAddress,
    permissions,
    categories: categories.length > 0 ? categories : ["Digital Art"],
    createdAt: Date.now(),
    connectionStatus: "disconnected",
    spendingLimits: spendingLimits || createDefaultSpendingLimits(),
  };

  data.agents[apiKey] = record;
  saveAgents(data);

  return record;
}

/**
 * Verify API key and return agent info (without exposing the full key)
 */
export function verifyApiKey(
  apiKey: string
): Omit<AgentRecord, "apiKey"> | null {
  const data = loadAgents();
  const record = data.agents[apiKey];

  if (!record) {
    return null;
  }

  // Return agent info without the API key
  const { apiKey: _, ...agentInfo } = record;
  return agentInfo;
}

/**
 * Get all agents (public view, no API keys)
 */
export function getAllAgents(): Array<Omit<AgentRecord, "apiKey">> {
  const data = loadAgents();
  return Object.values(data.agents).map(({ apiKey: _, ...agent }) => agent);
}

/**
 * Get agent by wallet address (owner view only)
 */
export function getAgentByWallet(walletAddress: string): AgentRecord | null {
  const data = loadAgents();
  return (
    Object.values(data.agents).find((a) => a.walletAddress === walletAddress) ||
    null
  );
}

/**
 * Regenerate API key for an agent
 */
export function regenerateApiKey(walletAddress: string): AgentRecord | null {
  const data = loadAgents();
  const oldRecord = Object.entries(data.agents).find(
    ([_, record]) => record.walletAddress === walletAddress
  );

  if (!oldRecord) {
    return null;
  }

  const [oldKey, record] = oldRecord;
  const newKey = generateApiKey();

  // Remove old record
  delete data.agents[oldKey];

  // Create new record with new API key
  const newRecord: AgentRecord = {
    ...record,
    apiKey: newKey,
  };

  data.agents[newKey] = newRecord;
  saveAgents(data);

  return newRecord;
}

/**
 * Update connection status
 */
export function updateConnectionStatus(
  apiKey: string,
  status: "connected" | "disconnected"
): boolean {
  const data = loadAgents();
  const record = data.agents[apiKey];

  if (!record) {
    return false;
  }

  record.connectionStatus = status;
  saveAgents(data);
  return true;
}

/**
 * Check and reset spending limits if their period has elapsed
 */
export function resetSpendingIfNeeded(limits: SpendingLimits): SpendingLimits {
  const now = Date.now();
  const updated = { ...limits };

  // Reset daily
  if (now >= updated.daily.resetAt) {
    updated.daily.spent = 0;
    updated.daily.resetAt = now + 24 * 60 * 60 * 1000;
  }

  // Reset weekly
  if (now >= updated.weekly.resetAt) {
    updated.weekly.spent = 0;
    updated.weekly.resetAt = getNextMonday(now);
  }

  // Reset monthly
  if (now >= updated.monthly.resetAt) {
    updated.monthly.spent = 0;
    updated.monthly.resetAt = getFirstOfNextMonth(now);
  }

  return updated;
}

/**
 * Update spending limits for an agent
 */
export function updateSpendingLimits(
  walletAddress: string,
  limits: SpendingLimits
): AgentRecord | null {
  const data = loadAgents();
  const record = Object.values(data.agents).find(
    (a) => a.walletAddress === walletAddress
  );

  if (!record) {
    return null;
  }

  // Reset limits if needed before updating
  const resetLimits = resetSpendingIfNeeded(limits);

  record.spendingLimits = resetLimits;
  saveAgents(data);

  return record;
}

/**
 * Record a spend and check if it exceeds limits
 */
export function recordSpend(
  walletAddress: string,
  amount: number,
  currency: "SOL" | "USD1"
): {
  success: boolean;
  message?: string;
  remaining?: { daily: number; weekly: number; monthly: number };
  exceeded?: string[];
} {
  const data = loadAgents();
  const record = Object.values(data.agents).find(
    (a) => a.walletAddress === walletAddress
  );

  if (!record || !record.spendingLimits) {
    return { success: false, message: "Agent not found" };
  }

  // Reset if needed
  const limits = resetSpendingIfNeeded(record.spendingLimits);

  // Check if spending would exceed limits
  const exceeded: string[] = [];

  // Check daily limit
  if (limits.daily.enabled && limits.daily.currency === currency) {
    if (limits.daily.spent + amount > limits.daily.limit) {
      exceeded.push(
        `Daily limit exceeded: ${(limits.daily.spent + amount).toFixed(2)} > ${limits.daily.limit.toFixed(2)} ${currency}`
      );
    }
  }

  // Check weekly limit
  if (limits.weekly.enabled && limits.weekly.currency === currency) {
    if (limits.weekly.spent + amount > limits.weekly.limit) {
      exceeded.push(
        `Weekly limit exceeded: ${(limits.weekly.spent + amount).toFixed(2)} > ${limits.weekly.limit.toFixed(2)} ${currency}`
      );
    }
  }

  // Check monthly limit
  if (limits.monthly.enabled && limits.monthly.currency === currency) {
    if (limits.monthly.spent + amount > limits.monthly.limit) {
      exceeded.push(
        `Monthly limit exceeded: ${(limits.monthly.spent + amount).toFixed(2)} > ${limits.monthly.limit.toFixed(2)} ${currency}`
      );
    }
  }

  if (exceeded.length > 0) {
    return {
      success: false,
      message: "Spending limit exceeded",
      exceeded,
      remaining: {
        daily: limits.daily.enabled
          ? Math.max(0, limits.daily.limit - limits.daily.spent)
          : -1,
        weekly: limits.weekly.enabled
          ? Math.max(0, limits.weekly.limit - limits.weekly.spent)
          : -1,
        monthly: limits.monthly.enabled
          ? Math.max(0, limits.monthly.limit - limits.monthly.spent)
          : -1,
      },
    };
  }

  // Record the spend
  limits.daily.spent += amount;
  limits.weekly.spent += amount;
  limits.monthly.spent += amount;

  record.spendingLimits = limits;
  saveAgents(data);

  return {
    success: true,
    remaining: {
      daily: limits.daily.enabled
        ? Math.max(0, limits.daily.limit - limits.daily.spent)
        : -1,
      weekly: limits.weekly.enabled
        ? Math.max(0, limits.weekly.limit - limits.weekly.spent)
        : -1,
      monthly: limits.monthly.enabled
        ? Math.max(0, limits.monthly.limit - limits.monthly.spent)
        : -1,
    },
  };
}

/**
 * Get budget status for an agent
 */
export function getBudgetStatus(walletAddress: string): {
  limits: SpendingLimits;
  progress: { daily: number; weekly: number; monthly: number };
} | null {
  const data = loadAgents();
  const record = Object.values(data.agents).find(
    (a) => a.walletAddress === walletAddress
  );

  if (!record || !record.spendingLimits) {
    return null;
  }

  // Reset limits if needed
  const limits = resetSpendingIfNeeded(record.spendingLimits);
  record.spendingLimits = limits;
  saveAgents(data);

  return {
    limits,
    progress: {
      daily:
        limits.daily.enabled && limits.daily.limit > 0
          ? (limits.daily.spent / limits.daily.limit) * 100
          : 0,
      weekly:
        limits.weekly.enabled && limits.weekly.limit > 0
          ? (limits.weekly.spent / limits.weekly.limit) * 100
          : 0,
      monthly:
        limits.monthly.enabled && limits.monthly.limit > 0
          ? (limits.monthly.spent / limits.monthly.limit) * 100
          : 0,
    },
  };
}
