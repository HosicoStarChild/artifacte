// Treasury that receives all platform fees, royalties, and Artifacte sale proceeds.
export const TREASURY_WALLET = "82v8xATLqdvq3cS1CXwpygVUH926QKdAd4NVxD91r4a6";

// The single owner wallet that is allowed to mint Artifacte NFTs and list them on-chain.
export const OWNER_WALLET = "DDSpvAK8DbuAdEaaBHkfLieLPSJVCWWgquFAA3pvxXoX";

// Backwards-compatible alias. Some legacy callers import ADMIN_WALLET expecting the owner key.
export const ADMIN_WALLET = OWNER_WALLET;

// Mint authority is restricted to the single owner wallet per the Artifacte workflow.
export const ADMIN_WALLETS = [OWNER_WALLET] as const;

// Wallets that may view admin surfaces (read-only tools, applications review, etc.).
// Mint and listing actions must use isOwnerWallet, not hasAdminAccess.
export const ADMIN_ACCESS_WALLETS = [
  TREASURY_WALLET,
  OWNER_WALLET,
  "7fignaSBU6FDWtz2HphpTaNG1dQqrmTtWcNAN4hWG8b1",
  "3EFvrQ9rqSr6TjeaNKQucyUNTp3Cm6GsqTPKa7HC2SAH",
] as const;

const adminWalletSet = new Set<string>(ADMIN_WALLETS);
const adminAccessWalletSet = new Set<string>(ADMIN_ACCESS_WALLETS);

export function isOwnerWallet(wallet?: string | null): boolean {
  return !!wallet && wallet === OWNER_WALLET;
}

export function isAdminWallet(wallet?: string | null): boolean {
  return !!wallet && adminWalletSet.has(wallet);
}

export function hasAdminAccess(wallet?: string | null): boolean {
  return !!wallet && adminAccessWalletSet.has(wallet);
}