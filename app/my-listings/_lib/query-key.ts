export function getMyListingsQueryKey(walletAddress: string | null) {
  return ["my-listings", walletAddress] as const;
}