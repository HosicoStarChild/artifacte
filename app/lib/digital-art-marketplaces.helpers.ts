import type { AllowlistEntry } from "../../lib/allowlist";

const SOL_MINT = "So11111111111111111111111111111111111111112";
const USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const PLACEHOLDER_IMAGE = "/placeholder.png";
const MIN_VALID_LISTING_PRICE_RAW = 1_000_000;
const DISPLAY_PRICE_THRESHOLD = 100_000;

type MarketplaceNumericValue = number | string | null | undefined;
type MarketplaceTimestampValue = number | string | null | undefined;

export type MarketplaceSource = "magiceden" | "tensor";
export type MarketplaceBuyKind =
  | "magicedenM2"
  | "magicedenM3"
  | "tensorStandard"
  | "tensorCompressed";

export interface ExternalMarketplaceListing {
  id: string;
  source: MarketplaceSource;
  mint: string;
  name: string;
  image: string;
  collectionAddress: string;
  collectionName: string;
  price: number;
  priceRaw: number;
  royaltyBasisPoints: number;
  currencySymbol: string;
  currencyMint: string;
  seller: string;
  listedAt?: number;
  buyKind: MarketplaceBuyKind;
  marketplaceUrl?: string;
}

export interface MarketplaceSourceCounts {
  magiceden: number | null;
  tensor: number | null;
}

export interface MarketplaceListingsState {
  degraded: boolean;
  stale: boolean;
  unavailableSources: MarketplaceSource[];
  warning: string | null;
}

export interface CuratedMarketplaceListingsResult {
  listings: ExternalMarketplaceListing[];
  nextCursor: string | null;
  hasMore: boolean;
  sourceCounts?: MarketplaceSourceCounts;
  state: MarketplaceListingsState;
}

export interface HeliusAsset {
  id: string;
  content?: {
    metadata?: {
      name?: string;
      sellerFeeBasisPoints?: number | string | null;
      seller_fee_basis_points?: number | string | null;
    };
    links?: {
      image?: string;
    };
    files?: Array<{ uri?: string }>;
  };
  royalty?: {
    basisPoints?: number | string | null;
    basis_points?: number | string | null;
  };
  grouping?: Array<{ group_key?: string; group_value?: string }>;
  authorities?: Array<{ address?: string }>;
  compression?: {
    compressed?: boolean;
  };
}

export interface MarketplaceCursor {
  meOffset: number;
  tensorCursor: string | null;
  meDone: boolean;
  tensorDone: boolean;
}

export interface MagicEdenListingRaw {
  tokenMint?: string | null;
  mintAddress?: string | null;
  mint?: string | null;
  nftAddress?: string | null;
  currency?: string | null;
  sellerFeeBasisPoints?: number | string | null;
  seller_fee_basis_points?: number | string | null;
  price?: number | string | null;
  priceInfo?: {
    solPrice?: number | string | null;
    sellerFeeBasisPoints?: number | string | null;
    seller_fee_basis_points?: number | string | null;
  } | null;
  takerAmount?: number | string | null;
  seller?: string | null;
  owner?: string | null;
  auctionHouse?: string | null;
  listingSource?: string | null;
  createdAt?: number | string | null;
  updatedAt?: number | string | null;
}

export interface TensorMintInfoRaw {
  onchainId?: string | null;
  id?: string | null;
  currency?: string | null;
  sellerFeeBasisPoints?: number | string | null;
  seller_fee_basis_points?: number | string | null;
  compressed?: boolean | null;
}

export interface TensorListingDetailsRaw {
  currencyMint?: string | null;
  currency?: string | null;
  sellerFeeBasisPoints?: number | string | null;
  seller_fee_basis_points?: number | string | null;
  price?: number | string | null;
  grossAmount?: number | string | null;
  maxAmount?: number | string | null;
  seller?: string | null;
  owner?: string | null;
  createdAt?: number | string | null;
  updatedAt?: number | string | null;
}

export interface TensorListingRaw {
  mint?: string | TensorMintInfoRaw | null;
  mintOnchainId?: string | null;
  onchainId?: string | null;
  id?: string | null;
  currencyMint?: string | null;
  currency?: string | null;
  sellerFeeBasisPoints?: number | string | null;
  seller_fee_basis_points?: number | string | null;
  listing?: TensorListingDetailsRaw | null;
  activeListing?: TensorListingDetailsRaw | null;
  price?: number | string | null;
  grossAmount?: number | string | null;
  maxAmount?: number | string | null;
  seller?: string | null;
  owner?: string | null;
  createdAt?: number | string | null;
  updatedAt?: number | string | null;
  compressed?: boolean | null;
}

export interface MagicEdenPage {
  listings: MagicEdenListingRaw[];
  nextOffset: number;
  hasMore: boolean;
}

export interface TensorPage {
  listings: TensorListingRaw[];
  nextCursor?: string | null;
  hasMore: boolean;
}

export interface TensorCollectionPaginationLike {
  cursor?: string | null;
  nextCursor?: string | null;
  pagination?: {
    nextCursor?: string | null;
  } | null;
  page?: {
    endCursor?: string | null;
    hasMore?: boolean | null;
  } | null;
}

export interface CuratedCollectionFile {
  collections: AllowlistEntry[];
}

export interface HeliusAssetBatchResult {
  assets: Map<string, HeliusAsset>;
  errorCount: number;
}

export interface ExpiringCacheEntry<TValue> {
  expiresAt: number;
  value: TValue;
}

export interface GetCuratedMarketplaceListingsInput {
  collectionAddress: string;
  cursor?: string | null;
  limit?: number;
  source?: MarketplaceSource;
}

export interface GetCuratedMarketplaceListingInput {
  collectionAddress: string;
  source: MarketplaceSource;
  mint: string;
}

export interface MarketplaceListingsPageBatch {
  hasMore: boolean;
  listings: ExternalMarketplaceListing[];
  nextCursor: MarketplaceCursor;
  unavailableSources?: MarketplaceSource[];
}

export interface AccumulateMarketplaceListingsPagesInput {
  initialCursor: MarketplaceCursor;
  loadPage: (cursor: MarketplaceCursor) => Promise<MarketplaceListingsPageBatch>;
  maxPasses?: number;
  minListings?: number;
}

export interface AccumulateMarketplaceListingsPagesResult {
  hasMore: boolean;
  listings: ExternalMarketplaceListing[];
  nextCursor: MarketplaceCursor | null;
  unavailableSources: MarketplaceSource[];
}

interface CurrencyInfo {
  mint: string;
  symbol: string;
  decimals: number;
}

type TensorListingSource = TensorListingDetailsRaw | TensorListingRaw;

export function getCollectionAddress(entry: AllowlistEntry): string | null {
  return entry.collectionAddress || entry.mintAuthority || null;
}

export function getCollectionByAddress(
  collections: AllowlistEntry[],
  address: string
): AllowlistEntry | null {
  return (
    collections.find((entry) => getCollectionAddress(entry) === address) || null
  );
}

export function getSiblingCollectionAddresses(
  collections: AllowlistEntry[],
  address: string
): string[] {
  const target = getCollectionByAddress(collections, address);
  if (!target) return [address];
  const addresses = collections
    .filter((entry) => entry.name === target.name)
    .map(getCollectionAddress)
    .filter((value): value is string => Boolean(value));
  return Array.from(new Set(addresses));
}

export function getMarketplaceIds(entry: AllowlistEntry): {
  magicEdenSymbol?: string;
  tensorCollId?: string;
} {
  const magicEdenSymbol = entry.marketplaces?.magicEden?.symbol;
  const tensorCollId =
    entry.marketplaces?.tensor?.slug ||
    entry.collectionAddress ||
    entry.mintAuthority;
  return { magicEdenSymbol, tensorCollId };
}

export function decodeCursor(cursor?: string | null): MarketplaceCursor {
  if (!cursor) {
    return { meOffset: 0, tensorCursor: null, meDone: false, tensorDone: false };
  }

  try {
    const raw = Buffer.from(cursor, "base64url").toString("utf-8");
    const parsed = JSON.parse(raw) as Partial<MarketplaceCursor>;
    return {
      meOffset:
        typeof parsed.meOffset === "number" && Number.isFinite(parsed.meOffset)
          ? parsed.meOffset
          : 0,
      tensorCursor:
        typeof parsed.tensorCursor === "string" ? parsed.tensorCursor : null,
      meDone: Boolean(parsed.meDone),
      tensorDone: Boolean(parsed.tensorDone),
    };
  } catch {
    return { meOffset: 0, tensorCursor: null, meDone: false, tensorDone: false };
  }
}

export function encodeCursor(cursor: MarketplaceCursor): string {
  return Buffer.from(JSON.stringify(cursor), "utf-8").toString("base64url");
}

export function normalizeMarketplaceLimit(limit?: number): number {
  return Math.min(Math.max(limit || 12, 1), 40);
}

function getMarketplaceSourceLabel(source: MarketplaceSource): string {
  return source === "magiceden" ? "Magic Eden" : "Tensor";
}

function uniqueMarketplaceSources(
  sources: readonly MarketplaceSource[]
): MarketplaceSource[] {
  return Array.from(new Set(sources));
}

export function hasMarketplaceCursorAdvanced(
  previous: MarketplaceCursor,
  next: MarketplaceCursor
): boolean {
  return (
    previous.meOffset !== next.meOffset ||
    previous.tensorCursor !== next.tensorCursor ||
    previous.meDone !== next.meDone ||
    previous.tensorDone !== next.tensorDone
  );
}

export async function accumulateMarketplaceListingsPages({
  initialCursor,
  loadPage,
  maxPasses = 1,
  minListings = 1,
}: AccumulateMarketplaceListingsPagesInput): Promise<AccumulateMarketplaceListingsPagesResult> {
  const normalizedMaxPasses = Math.max(maxPasses, 1);
  const normalizedMinListings = Math.max(minListings, 1);
  const unavailableSources = new Set<MarketplaceSource>();
  let accumulatedListings: ExternalMarketplaceListing[] = [];
  let currentCursor = initialCursor;
  let nextCursor: MarketplaceCursor | null = null;
  let hasMore = false;

  for (let pass = 0; pass < normalizedMaxPasses; pass += 1) {
    const page = await loadPage(currentCursor);
    const cursorAdvanced = hasMarketplaceCursorAdvanced(currentCursor, page.nextCursor);

    accumulatedListings = dedupeMarketplaceListings(
      sortMarketplaceListings([...accumulatedListings, ...page.listings])
    );
    hasMore = page.hasMore;
    nextCursor = page.nextCursor;

    for (const source of page.unavailableSources ?? []) {
      unavailableSources.add(source);
    }

    if (!cursorAdvanced) {
      hasMore = false;
      nextCursor = null;
      break;
    }

    if (accumulatedListings.length >= normalizedMinListings || !page.hasMore) {
      break;
    }

    currentCursor = page.nextCursor;
  }

  return {
    hasMore,
    listings: accumulatedListings,
    nextCursor: hasMore ? nextCursor : null,
    unavailableSources: uniqueMarketplaceSources(Array.from(unavailableSources)),
  };
}

function buildMarketplaceWarning(
  unavailableSources: readonly MarketplaceSource[],
  stale: boolean,
  hasListings: boolean
): string | null {
  if (!stale && unavailableSources.length === 0) {
    return null;
  }

  const label = unavailableSources.length
    ? unavailableSources.map(getMarketplaceSourceLabel).join(" and ")
    : "one or more marketplace sources";

  if (stale) {
    return `Live listings from ${label} are temporarily unavailable. Showing recent verified listings while the feed recovers.`;
  }

  if (hasListings) {
    return `Listings from ${label} are temporarily unavailable. Results may be incomplete until the feed recovers.`;
  }

  return `Live listings from ${label} are temporarily unavailable. Try again shortly.`;
}

export function buildMarketplaceState(
  unavailableSources: readonly MarketplaceSource[],
  stale: boolean,
  hasListings: boolean
): MarketplaceListingsState {
  const normalizedSources = uniqueMarketplaceSources(unavailableSources);

  return {
    degraded: stale || normalizedSources.length > 0,
    stale,
    unavailableSources: normalizedSources,
    warning: buildMarketplaceWarning(normalizedSources, stale, hasListings),
  };
}

export function readExpiringCache<TValue>(
  cache: Map<string, ExpiringCacheEntry<TValue>>,
  key: string
): TValue | undefined {
  const cached = cache.get(key);

  if (!cached) {
    return undefined;
  }

  if (cached.expiresAt <= Date.now()) {
    cache.delete(key);
    return undefined;
  }

  return cached.value;
}

export function writeExpiringCache<TValue>(
  cache: Map<string, ExpiringCacheEntry<TValue>>,
  key: string,
  value: TValue,
  ttlMs: number
): TValue {
  cache.set(key, {
    expiresAt: Date.now() + ttlMs,
    value,
  });

  return value;
}

export function createMarketplaceListingsCacheKey(
  input: GetCuratedMarketplaceListingsInput,
  limit: number
): string {
  return JSON.stringify({
    collectionAddress: input.collectionAddress,
    cursor: input.cursor || null,
    limit,
    source: input.source || null,
  });
}

export function createMarketplaceListingDetailCacheKey(
  input: GetCuratedMarketplaceListingInput
): string {
  return JSON.stringify(input);
}

export function getTensorCollectionPagination(
  payload: TensorCollectionPaginationLike
): { hasMore: boolean; nextCursor: string | null } {
  const nextCursor =
    payload.page?.endCursor ||
    payload.nextCursor ||
    payload.cursor ||
    payload.pagination?.nextCursor ||
    null;
  const hasMore =
    typeof payload.page?.hasMore === "boolean"
      ? payload.page.hasMore
      : Boolean(nextCursor);

  return {
    hasMore,
    nextCursor,
  };
}

export function shouldKeepMarketplaceFallback(
  result: CuratedMarketplaceListingsResult
): boolean {
  return !result.state.degraded;
}

export function createStaleMarketplaceResult(
  fallback: CuratedMarketplaceListingsResult,
  liveState: MarketplaceListingsState
): CuratedMarketplaceListingsResult {
  const unavailableSources = uniqueMarketplaceSources([
    ...fallback.state.unavailableSources,
    ...liveState.unavailableSources,
  ]);

  return {
    ...fallback,
    state: buildMarketplaceState(
      unavailableSources,
      true,
      fallback.listings.length > 0
    ),
  };
}

export function assetMatchesCuratedCollection(
  asset: HeliusAsset | undefined,
  collectionAddresses: ReadonlySet<string>
): boolean {
  if (!asset) return false;

  for (const group of asset.grouping || []) {
    if (
      group.group_key === "collection" &&
      group.group_value &&
      collectionAddresses.has(group.group_value)
    ) {
      return true;
    }
  }

  for (const authority of asset.authorities || []) {
    if (authority.address && collectionAddresses.has(authority.address)) {
      return true;
    }
  }

  return false;
}

export function normalizeTimestamp(
  value: MarketplaceTimestampValue
): number | undefined {
  if (value == null) return undefined;
  if (typeof value === "number") {
    return value > 1_000_000_000_000 ? value : value * 1000;
  }
  const numeric = Number(value);
  if (Number.isFinite(numeric)) {
    return normalizeTimestamp(numeric);
  }
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? undefined : parsed;
}

export function parseRawAmount(value: MarketplaceNumericValue): number | null {
  if (value == null) return null;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return null;
    if (value % 1 !== 0) return Math.round(value * 1e9);
    return value;
  }
  if (value.includes(".")) {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? Math.round(numeric * 1e9) : null;
  }
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.round(numeric) : null;
}

function parseBasisPoints(value: MarketplaceNumericValue): number | null {
  if (value == null) return null;

  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) {
    return null;
  }

  return Math.round(numeric);
}

function getCurrencyInfo(currencyValue: string | null | undefined): CurrencyInfo {
  const normalized = (currencyValue || "").trim();
  if (
    normalized === "USDC" ||
    normalized === USDC_MINT ||
    normalized.toLowerCase() === "usdc"
  ) {
    return { mint: USDC_MINT, symbol: "USDC", decimals: 6 };
  }
  return { mint: SOL_MINT, symbol: "SOL", decimals: 9 };
}

function toDisplayPrice(rawAmount: number, decimals: number): number {
  return rawAmount / 10 ** decimals;
}

function resolveAssetRoyaltyBasisPoints(asset?: HeliusAsset): number {
  return (
    parseBasisPoints(
      asset?.royalty?.basis_points ??
        asset?.royalty?.basisPoints ??
        asset?.content?.metadata?.seller_fee_basis_points ??
        asset?.content?.metadata?.sellerFeeBasisPoints
    ) ?? 0
  );
}

function resolveMagicEdenRoyaltyBasisPoints(
  raw: MagicEdenListingRaw,
  asset?: HeliusAsset
): number {
  return (
    parseBasisPoints(
      raw.sellerFeeBasisPoints ??
        raw.seller_fee_basis_points ??
        raw.priceInfo?.sellerFeeBasisPoints ??
        raw.priceInfo?.seller_fee_basis_points
    ) ?? resolveAssetRoyaltyBasisPoints(asset)
  );
}

function resolveTensorRoyaltyBasisPoints(
  raw: TensorListingRaw,
  listing: TensorListingSource,
  mintInfo: TensorMintInfoRaw | null,
  asset?: HeliusAsset
): number {
  return (
    parseBasisPoints(
      listing.sellerFeeBasisPoints ??
        listing.seller_fee_basis_points ??
        mintInfo?.sellerFeeBasisPoints ??
        mintInfo?.seller_fee_basis_points ??
        raw.sellerFeeBasisPoints ??
        raw.seller_fee_basis_points
    ) ?? resolveAssetRoyaltyBasisPoints(asset)
  );
}

export function extractMagicEdenMint(raw: MagicEdenListingRaw): string | null {
  const mint = raw.tokenMint || raw.mintAddress || raw.mint || raw.nftAddress || null;
  return mint ? mint : null;
}

function getTensorMintInfo(raw: TensorListingRaw): TensorMintInfoRaw | null {
  return typeof raw.mint === "string" || !raw.mint ? null : raw.mint;
}

function getTensorListingSource(raw: TensorListingRaw): TensorListingSource {
  return raw.listing || raw.activeListing || raw;
}

export function extractTensorMint(raw: TensorListingRaw): string | null {
  const mintInfo = getTensorMintInfo(raw);
  return (
    (typeof raw.mint === "string" ? raw.mint : null) ||
    mintInfo?.onchainId ||
    mintInfo?.id ||
    raw.mintOnchainId ||
    raw.onchainId ||
    raw.id ||
    null
  );
}

export function normalizeMagicEdenListing(
  raw: MagicEdenListingRaw,
  assetMap: Map<string, HeliusAsset>,
  curatedAddresses: ReadonlySet<string>,
  collectionAddress: string,
  collectionName: string
): ExternalMarketplaceListing | null {
  const mint = extractMagicEdenMint(raw);
  if (!mint) {
    console.log("[normME] no mint for", raw.tokenMint, raw.mintAddress);
    return null;
  }

  const asset = assetMap.get(mint);
  if (!assetMatchesCuratedCollection(asset, curatedAddresses)) return null;

  const currency = getCurrencyInfo(raw.currency || SOL_MINT);
  const rawPriceValue =
    (raw.price != null && Number(raw.price) > 0 ? raw.price : null) ??
    raw.priceInfo?.solPrice ??
    raw.takerAmount ??
    raw.price ??
    null;
  let priceRaw = parseRawAmount(rawPriceValue);
  if (priceRaw != null && priceRaw > 0 && priceRaw < DISPLAY_PRICE_THRESHOLD) {
    priceRaw = Math.round(priceRaw * 1e9);
  }
  if (priceRaw == null || priceRaw < MIN_VALID_LISTING_PRICE_RAW) return null;

  const seller = raw.seller || raw.owner || "";
  const isM3 = !raw.auctionHouse || raw.listingSource === "M3";
  const royaltyBasisPoints = resolveMagicEdenRoyaltyBasisPoints(raw, asset);

  return {
    id: `magiceden:${mint}`,
    source: "magiceden",
    mint,
    name: asset?.content?.metadata?.name || "Untitled",
    image:
      asset?.content?.links?.image ||
      asset?.content?.files?.[0]?.uri ||
      PLACEHOLDER_IMAGE,
    collectionAddress,
    collectionName,
    priceRaw,
    price: toDisplayPrice(priceRaw, currency.decimals),
    royaltyBasisPoints,
    currencySymbol: currency.symbol,
    currencyMint: currency.mint,
    seller,
    listedAt: normalizeTimestamp(raw.createdAt || raw.updatedAt),
    buyKind: isM3 ? "magicedenM3" : "magicedenM2",
    marketplaceUrl: `https://magiceden.io/item-details/${mint}`,
  };
}

export function normalizeTensorListing(
  raw: TensorListingRaw,
  assetMap: Map<string, HeliusAsset>,
  curatedAddresses: ReadonlySet<string>,
  collectionAddress: string,
  collectionName: string
): ExternalMarketplaceListing | null {
  const mint = extractTensorMint(raw);
  if (!mint) return null;

  const asset = assetMap.get(mint);
  if (!assetMatchesCuratedCollection(asset, curatedAddresses)) return null;

  const mintInfo = getTensorMintInfo(raw);
  const listing = getTensorListingSource(raw);
  const currency = getCurrencyInfo(
    listing.currencyMint || listing.currency || mintInfo?.currency || SOL_MINT
  );
  const priceRaw = parseRawAmount(
    listing.price ??
      listing.grossAmount ??
      listing.maxAmount ??
      raw.price ??
      raw.grossAmount
  );
  if (priceRaw == null || priceRaw < MIN_VALID_LISTING_PRICE_RAW) return null;

  const compressed =
    Boolean(asset?.compression?.compressed) ||
    Boolean(raw.compressed) ||
    Boolean(mintInfo?.compressed);
  const royaltyBasisPoints = resolveTensorRoyaltyBasisPoints(
    raw,
    listing,
    mintInfo,
    asset
  );

  return {
    id: `tensor:${mint}`,
    source: "tensor",
    mint,
    name: asset?.content?.metadata?.name || "Untitled",
    image:
      asset?.content?.links?.image ||
      asset?.content?.files?.[0]?.uri ||
      PLACEHOLDER_IMAGE,
    collectionAddress,
    collectionName,
    priceRaw,
    price: toDisplayPrice(priceRaw, currency.decimals),
    royaltyBasisPoints,
    currencySymbol: currency.symbol,
    currencyMint: currency.mint,
    seller: listing.seller || listing.owner || raw.owner || "",
    listedAt: normalizeTimestamp(
      listing.createdAt || listing.updatedAt || raw.createdAt || raw.updatedAt
    ),
    buyKind: compressed ? "tensorCompressed" : "tensorStandard",
    marketplaceUrl: `https://www.tensor.trade/item/${mint}`,
  };
}

export function sortMarketplaceListings(
  listings: readonly ExternalMarketplaceListing[]
): ExternalMarketplaceListing[] {
  return [...listings].sort((left, right) => {
    if (left.priceRaw !== right.priceRaw) {
      return left.priceRaw - right.priceRaw;
    }

    return (right.listedAt || 0) - (left.listedAt || 0);
  });
}

export function dedupeMarketplaceListings(
  listings: readonly ExternalMarketplaceListing[]
): ExternalMarketplaceListing[] {
  const seenIds = new Set<string>();
  const deduped: ExternalMarketplaceListing[] = [];

  for (const listing of listings) {
    if (seenIds.has(listing.id)) {
      continue;
    }

    seenIds.add(listing.id);
    deduped.push(listing);
  }

  return deduped;
}