import "server-only";

export type SolanaCluster = "devnet" | "mainnet-beta";

const PROD_ORACLE_URL = "https://artifacte-oracle-production.up.railway.app";
const LOCAL_ORACLE_URL = "http://localhost:4567";

export function normalizeSolanaCluster(value?: string | null): SolanaCluster {
  const normalized = (value || "").trim().toLowerCase();

  if (normalized === "devnet") return "devnet";
  if (normalized === "mainnet" || normalized === "mainnet-beta" || normalized === "mainnetbeta") {
    return "mainnet-beta";
  }

  return "mainnet-beta";
}

export function getServerSolanaCluster(): SolanaCluster {
  return normalizeSolanaCluster(
    process.env.SOLANA_CLUSTER ||
      process.env.NEXT_PUBLIC_SOLANA_CLUSTER ||
      process.env.NEXT_PUBLIC_SOLANA_NETWORK
  );
}

export function getDefaultOracleApiUrl(cluster: SolanaCluster = getServerSolanaCluster()): string {
  void cluster;

  // Keep the local oracle opt-in via explicit env vars instead of silently
  // falling back to localhost for previews, custom domains, or local app runs.
  return PROD_ORACLE_URL;
}

export function getOracleApiUrl(cluster: SolanaCluster = getServerSolanaCluster()): string {
  const explicitUrl = process.env.ORACLE_API_URL || process.env.ORACLE_URL || process.env.NEXT_PUBLIC_ORACLE_URL;
  if (explicitUrl) return explicitUrl;

  if (cluster === "devnet") {
    return process.env.ORACLE_URL_DEVNET || process.env.NEXT_PUBLIC_ORACLE_URL_DEVNET || getDefaultOracleApiUrl(cluster);
  }

  return process.env.ORACLE_URL_MAINNET || process.env.NEXT_PUBLIC_ORACLE_URL_MAINNET || getDefaultOracleApiUrl(cluster);
}