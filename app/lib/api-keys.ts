import crypto from "crypto";
import fs from "fs";
import path from "path";

const DATA_DIR = path.join(process.cwd(), "data");
const AGENTS_FILE = path.join(DATA_DIR, "agents.json");

export interface AgentRecord {
  walletAddress: string;
  agentName: string;
  apiKey: string;
  nftMint: string;
  permissions: {
    Trade: boolean;
    Bid: boolean;
    Chat: boolean;
  };
  createdAt: number;
  connectionStatus: "connected" | "disconnected";
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
 * Register a new agent API key
 */
export function registerAgentApiKey(
  walletAddress: string,
  agentName: string,
  apiKey: string,
  nftMint: string,
  permissions: { Trade: boolean; Bid: boolean; Chat: boolean }
): AgentRecord {
  const data = loadAgents();

  const record: AgentRecord = {
    walletAddress,
    agentName,
    apiKey,
    nftMint,
    permissions,
    createdAt: Date.now(),
    connectionStatus: "disconnected",
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
