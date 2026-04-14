export const TREASURY_WALLET = "6drXw31FjHch4ixXa4ngTyUD2cySUs3mpcB2YYGA9g7P";
export const ADMIN_WALLET = "DDSpvAK8DbuAdEaaBHkfLieLPSJVCWWgquFAA3pvxXoX";
export const ADMIN_WALLETS = [
  ADMIN_WALLET,
  "7fignaSBU6FDWtz2HphpTaNG1dQqrmTtWcNAN4hWG8b1",
  "3EFvrQ9rqSr6TjeaNKQucyUNTp3Cm6GsqTPKa7HC2SAH",
] as const;
export const ADMIN_ACCESS_WALLETS = [TREASURY_WALLET, ...ADMIN_WALLETS] as const;

const adminWalletSet = new Set<string>(ADMIN_WALLETS);
const adminAccessWalletSet = new Set<string>(ADMIN_ACCESS_WALLETS);

export function isAdminWallet(wallet?: string | null): boolean {
  return !!wallet && adminWalletSet.has(wallet);
}

export function hasAdminAccess(wallet?: string | null): boolean {
  return !!wallet && adminAccessWalletSet.has(wallet);
}