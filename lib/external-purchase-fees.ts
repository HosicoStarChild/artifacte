export const EXTERNAL_MARKETPLACE_FEE_BPS = 200;
export const EXTERNAL_MARKETPLACE_FEE_RATE = EXTERNAL_MARKETPLACE_FEE_BPS / 10000;
export const EXTERNAL_MARKETPLACE_FEE_WALLET = "6drXw31FjHch4ixXa4ngTyUD2cySUs3mpcB2YYGA9g7P";
export const ARTIFACTE_COLLECTION_ID = "jzkJTGAuDcWthM91S1ch7wPcfMUQB5CdYH6hA25K4CS";
export const ARTIFACTE_UPDATE_AUTHORITY = "DDSpvAK8DbuAdEaaBHkfLieLPSJVCWWgquFAA3pvxXoX";

type CollectionValue =
  | string
  | {
      address?: string | null;
      key?: string | null;
    }
  | null
  | undefined;

export interface ArtifacteAssetLike {
  authorities?: Array<{ address?: string | null }>;
  collection?: CollectionValue;
  content?: {
    metadata?: {
      collection?: CollectionValue;
    };
  };
  grouping?: Array<{
    group_key?: string | null;
    group_value?: string | null;
  }>;
}

export interface ExternalFeeContext {
  asset?: ArtifacteAssetLike | null;
  collectionAddress?: string | null;
  collectionName?: string | null;
  source?: string | null;
}

function appendCollectionCandidate(
  candidates: Set<string>,
  value: CollectionValue
) {
  if (!value) return;

  if (typeof value === "string") {
    if (value) candidates.add(value);
    return;
  }

  if (value.address) candidates.add(value.address);
  if (value.key) candidates.add(value.key);
}

export function isArtifacteCollectionName(name?: string | null): boolean {
  const normalized = name?.trim().toLowerCase();
  if (!normalized) return false;
  return normalized === "artifacte" || normalized.includes("artifacte");
}

export function isArtifacteAsset(asset?: ArtifacteAssetLike | null): boolean {
  if (!asset) return false;

  if (
    asset.authorities?.some(
      (authority) => authority.address === ARTIFACTE_UPDATE_AUTHORITY
    )
  ) {
    return true;
  }

  const candidates = new Set<string>();
  appendCollectionCandidate(candidates, asset.collection);
  appendCollectionCandidate(candidates, asset.content?.metadata?.collection);

  for (const group of asset.grouping || []) {
    if (!group.group_value) continue;
    if (!group.group_key || group.group_key === "collection") {
      candidates.add(group.group_value);
    }
  }

  return candidates.has(ARTIFACTE_COLLECTION_ID);
}

export function isArtifacteExternalFeeExempt(
  context?: ExternalFeeContext | null
): boolean {
  if (!context) return false;

  if (context.source === "artifacte") return true;
  if (context.collectionAddress === ARTIFACTE_COLLECTION_ID) return true;
  if (isArtifacteCollectionName(context.collectionName)) return true;
  if (isArtifacteAsset(context.asset)) return true;

  return false;
}

export function shouldApplyExternalMarketplaceFee(
  context?: ExternalFeeContext | null
): boolean {
  return !isArtifacteExternalFeeExempt(context);
}

export function calculateExternalMarketplaceFee(amount: number): number {
  return amount * EXTERNAL_MARKETPLACE_FEE_RATE;
}

export function calculateExternalMarketplaceFeeAmount(
  amountInBaseUnits: number
): number {
  return Math.ceil(
    amountInBaseUnits * EXTERNAL_MARKETPLACE_FEE_BPS / 10000
  );
}