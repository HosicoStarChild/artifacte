import "server-only";

import bundledAllowlist from "@/data/allowlist.json";
import type { AllowlistEntry } from "@/lib/allowlist";
import { readFile } from "fs/promises";
import path from "path";

const ALLOWLIST_FILE = path.join(process.cwd(), "data", "allowlist.json");
const HELIUS_RPC = `https://mainnet.helius-rpc.com/?api-key=${process.env.HELIUS_API_KEY}`;
const MAGIC_EDEN_API = "https://api-mainnet.magiceden.dev/v2";
const TENSOR_API = "https://api.mainnet.tensordev.io/api/v1";
const ME_API_KEY = process.env.ME_API_KEY;
const SOL_MINT = "So11111111111111111111111111111111111111112";
const USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";

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

interface CuratedMarketplaceListingsResult {
  listings: ExternalMarketplaceListing[];
  nextCursor: string | null;
  hasMore: boolean;
  sourceCounts?: MarketplaceSourceCounts;
  state: MarketplaceListingsState;
}

interface HeliusAsset {
  id: string;
  content?: {
    metadata?: {
      name?: string;
    };
    links?: {
      image?: string;
    };
    files?: Array<{ uri?: string }>;
  };
  grouping?: Array<{ group_key?: string; group_value?: string }>;
  authorities?: Array<{ address?: string }>;
  compression?: {
    compressed?: boolean;
  };
}

interface MarketplaceCursor {
  meOffset: number;
  tensorCursor?: string | null;
  meDone?: boolean;
  tensorDone?: boolean;
}

interface MagicEdenPage {
  listings: any[];
  nextOffset: number;
  hasMore: boolean;
}

interface TensorPage {
  listings: any[];
  nextCursor?: string | null;
  hasMore: boolean;
}

interface CuratedCollectionFile {
  collections: AllowlistEntry[];
}

interface HeliusAssetBatchResult {
  assets: Map<string, HeliusAsset>;
  errorCount: number;
}

interface ExpiringCacheEntry<TValue> {
  expiresAt: number;
  value: TValue;
}

type TensorCollIdCacheEntry = ExpiringCacheEntry<string | null>;

interface GetCuratedMarketplaceListingsInput {
  collectionAddress: string;
  cursor?: string | null;
  limit?: number;
}

interface GetCuratedMarketplaceListingInput {
  collectionAddress: string;
  source: MarketplaceSource;
  mint: string;
}

const BUNDLED_ALLOWLIST =
  bundledAllowlist as unknown as CuratedCollectionFile;

const TENSOR_COLL_ID_SUCCESS_TTL_MS = 15 * 60 * 1000;
const TENSOR_COLL_ID_EMPTY_TTL_MS = 5 * 60 * 1000;
const TENSOR_COLL_ID_ERROR_TTL_MS = 30 * 1000;
const MARKETPLACE_LISTINGS_CACHE_TTL_MS = 30 * 1000;
const MARKETPLACE_LISTINGS_DEGRADED_CACHE_TTL_MS = 10 * 1000;
const MARKETPLACE_LISTINGS_STALE_TTL_MS = 5 * 60 * 1000;
const MARKETPLACE_DETAIL_CACHE_TTL_MS = 15 * 1000;

export async function readCuratedCollections(): Promise<AllowlistEntry[]> {
  try {
    const content = await readFile(ALLOWLIST_FILE, "utf-8");
    const parsed = JSON.parse(content) as CuratedCollectionFile;
    return parsed.collections || [];
  } catch {
    return BUNDLED_ALLOWLIST.collections || [];
  }
}

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
  const targetName = target.name;
  const addresses = collections
    .filter((entry) => entry.name === targetName)
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

function decodeCursor(cursor?: string | null): MarketplaceCursor {
  if (!cursor) {
    return { meOffset: 0, tensorCursor: null, meDone: false, tensorDone: false };
  }

  try {
    const raw = Buffer.from(cursor, "base64url").toString("utf-8");
    const parsed = JSON.parse(raw) as MarketplaceCursor;
    return {
      meOffset: parsed.meOffset || 0,
      tensorCursor: parsed.tensorCursor || null,
      meDone: Boolean(parsed.meDone),
      tensorDone: Boolean(parsed.tensorDone),
    };
  } catch {
    return { meOffset: 0, tensorCursor: null, meDone: false, tensorDone: false };
  }
}

function encodeCursor(cursor: MarketplaceCursor): string {
  return Buffer.from(JSON.stringify(cursor), "utf-8").toString("base64url");
}

function normalizeMarketplaceLimit(limit?: number): number {
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

function buildMarketplaceState(
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

function readExpiringCache<TValue>(
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

function writeExpiringCache<TValue>(
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

function createMarketplaceListingsCacheKey(
  input: GetCuratedMarketplaceListingsInput,
  limit: number
): string {
  return JSON.stringify({
    collectionAddress: input.collectionAddress,
    cursor: input.cursor || null,
    limit,
  });
}

function createMarketplaceListingDetailCacheKey(
  input: GetCuratedMarketplaceListingInput
): string {
  return JSON.stringify(input);
}

function shouldKeepMarketplaceFallback(
  result: CuratedMarketplaceListingsResult
): boolean {
  return !result.state.degraded;
}

function createStaleMarketplaceResult(
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

function assetMatchesCuratedCollection(
  asset: HeliusAsset | undefined,
  collectionAddresses: Set<string>
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

function normalizeTimestamp(value: unknown): number | undefined {
  if (value == null) return undefined;
  if (typeof value === "number") {
    return value > 1_000_000_000_000 ? value : value * 1000;
  }
  if (typeof value === "string") {
    const numeric = Number(value);
    if (Number.isFinite(numeric)) {
      return normalizeTimestamp(numeric);
    }
    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? undefined : parsed;
  }
  return undefined;
}

function parseRawAmount(value: unknown): number | null {
  if (value == null) return null;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return null;
    // Float → already in display units (e.g. SOL from Magic Eden), convert to lamports
    if (value % 1 !== 0) return Math.round(value * 1e9);
    // Integer → already in lamports
    return value;
  }
  if (typeof value === "string") {
    if (value.includes(".")) {
      const numeric = Number(value);
      return Number.isFinite(numeric) ? Math.round(numeric * 1e9) : null;
    }
    const numeric = Number(value);
    return Number.isFinite(numeric) ? Math.round(numeric) : null;
  }
  return null;
}

function getCurrencyInfo(currencyValue: unknown): {
  mint: string;
  symbol: string;
  decimals: number;
} {
  const normalized = String(currencyValue || "").trim();
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

async function fetchHeliusAssetsByMint(
  mints: string[]
): Promise<HeliusAssetBatchResult> {
  const uniqueMints = Array.from(new Set(mints.filter(Boolean)));
  const assets = new Map<string, HeliusAsset>();

  if (!uniqueMints.length) {
    return { assets, errorCount: 0 };
  }

  if (!process.env.HELIUS_API_KEY) {
    return { assets, errorCount: 1 };
  }

  let errorCount = 0;

  for (let index = 0; index < uniqueMints.length; index += 100) {
    const chunk = uniqueMints.slice(index, index + 100);
    try {
      const response = await fetch(HELIUS_RPC, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: "digital-art-batch",
          method: "getAssetBatch",
          params: { ids: chunk },
        }),
        cache: "no-store",
      });

      if (!response.ok) {
        errorCount += 1;
        continue;
      }

      const payload = await response.json();
      for (const item of payload.result || []) {
        if (item?.id) {
          assets.set(item.id, item as HeliusAsset);
        }
      }
    } catch {
      errorCount += 1;
    }
  }

  return { assets, errorCount };
}

async function fetchMagicEdenListedCount(symbol: string): Promise<number | null> {
  try {
    const response = await fetch(
      `${MAGIC_EDEN_API}/collections/${symbol}/stats`,
      {
        headers: ME_API_KEY ? { Authorization: `Bearer ${ME_API_KEY}` } : undefined,
        cache: "no-store",
        signal: AbortSignal.timeout(8000),
      }
    );
    if (!response.ok) return null;
    const data = await response.json();
    return typeof data?.listedCount === "number" ? data.listedCount : null;
  } catch {
    return null;
  }
}

// Cache resolved Tensor collIds so we only call find_collection once per address
const tensorCollIdCache = new Map<string, TensorCollIdCacheEntry>();
const tensorCollIdRequests = new Map<string, Promise<string | null>>();
const marketplaceListingsCache = new Map<
  string,
  ExpiringCacheEntry<CuratedMarketplaceListingsResult>
>();
const marketplaceListingsFallbackCache = new Map<
  string,
  ExpiringCacheEntry<CuratedMarketplaceListingsResult>
>();
const marketplaceListingsRequests = new Map<
  string,
  Promise<CuratedMarketplaceListingsResult>
>();
const marketplaceListingDetailCache = new Map<
  string,
  ExpiringCacheEntry<ExternalMarketplaceListing | null>
>();
const marketplaceListingDetailRequests = new Map<
  string,
  Promise<ExternalMarketplaceListing | null>
>();

function readTensorCollIdCache(identifier: string): string | null | undefined {
  return readExpiringCache(tensorCollIdCache, identifier);
}

function writeTensorCollIdCache(identifier: string, value: string | null, ttlMs: number): string | null {
  return writeExpiringCache(tensorCollIdCache, identifier, value, ttlMs);
}

async function resolveTensorCollId(identifier: string): Promise<string | null> {
  const tensorApiKey = process.env.TENSOR_API_KEY;

  if (!tensorApiKey) return null;

  const cached = readTensorCollIdCache(identifier);
  if (cached !== undefined) return cached;

  const pendingRequest = tensorCollIdRequests.get(identifier);
  if (pendingRequest) return pendingRequest;

  const request = (async () => {
    try {
      const response = await fetch(
        `${TENSOR_API}/collections/find_collection?filter=${encodeURIComponent(identifier)}`,
        {
          headers: { "x-tensor-api-key": tensorApiKey },
          cache: "no-store",
          signal: AbortSignal.timeout(8000),
        }
      );

      if (!response.ok) {
        console.log(`[tensor] find_collection failed for ${identifier}: ${response.status}`);
        return writeTensorCollIdCache(identifier, null, TENSOR_COLL_ID_ERROR_TTL_MS);
      }

      const data = await response.json();
      const collId = typeof data?.collId === "string" && data.collId.trim()
        ? data.collId
        : null;

      console.log(`[tensor] resolved ${identifier} → collId: ${collId}`);

      return writeTensorCollIdCache(
        identifier,
        collId,
        collId ? TENSOR_COLL_ID_SUCCESS_TTL_MS : TENSOR_COLL_ID_EMPTY_TTL_MS
      );
    } catch (err) {
      console.log(`[tensor] find_collection error for ${identifier}:`, err);
      return writeTensorCollIdCache(identifier, null, TENSOR_COLL_ID_ERROR_TTL_MS);
    } finally {
      tensorCollIdRequests.delete(identifier);
    }
  })();

  tensorCollIdRequests.set(identifier, request);
  return request;
}

async function fetchTensorListedCount(collId: string): Promise<number | null> {
  if (!process.env.TENSOR_API_KEY) return null;
  try {
    const response = await fetch(
      `${TENSOR_API}/collections/stats?slugs=${encodeURIComponent(collId)}`,
      {
        headers: { "x-tensor-api-key": process.env.TENSOR_API_KEY },
        cache: "no-store",
        signal: AbortSignal.timeout(8000),
      }
    );
    if (!response.ok) return null;
    const data = await response.json();
    const stats = Array.isArray(data) ? data[0] : data?.collections?.[0] ?? data;
    return typeof stats?.numListed === "number" ? stats.numListed : null;
  } catch {
    return null;
  }
}

async function fetchMagicEdenCollectionListings(
  symbol: string,
  offset: number,
  limit: number
): Promise<MagicEdenPage> {
  const params = new URLSearchParams({
    offset: String(offset),
    limit: String(limit),
    listingAggMode: "false",
  });
  const response = await fetch(
    `${MAGIC_EDEN_API}/collections/${symbol}/listings?${params.toString()}`,
    {
      headers: ME_API_KEY ? { Authorization: `Bearer ${ME_API_KEY}` } : undefined,
      cache: "no-store",
      signal: AbortSignal.timeout(15000),
    }
  );

  if (!response.ok) {
    throw new Error(`Magic Eden listings request failed with status ${response.status}`);
  }

  const listings = (await response.json()) as any[];
  return {
    listings,
    nextOffset: offset + listings.length,
    hasMore: listings.length >= limit,
  };
}

async function fetchTensorCollectionListings(
  collId: string,
  cursor: string | null,
  limit: number
): Promise<TensorPage> {
  if (!process.env.TENSOR_API_KEY) {
    return { listings: [], nextCursor: null, hasMore: false };
  }

  const params = new URLSearchParams({
    collId,
    sortBy: "ListingPriceAsc",
    onlyListings: "true",
    limit: String(limit),
  });
  if (cursor) params.set("cursor", cursor);

  const response = await fetch(`${TENSOR_API}/mint/collection?${params.toString()}`, {
    headers: {
      "x-tensor-api-key": process.env.TENSOR_API_KEY,
    },
    cache: "no-store",
    signal: AbortSignal.timeout(15000),
  });

  if (!response.ok) {
    throw new Error(`Tensor listings request failed with status ${response.status}`);
  }

  const payload = await response.json();
  const listings = Array.isArray(payload?.mints)
    ? payload.mints
    : Array.isArray(payload?.listings)
      ? payload.listings
      : [];

  const nextCursor =
    payload?.nextCursor ||
    payload?.cursor ||
    payload?.pagination?.nextCursor ||
    null;

  return {
    listings,
    nextCursor,
    hasMore: Boolean(nextCursor),
  };
}

function normalizeMagicEdenListing(
  raw: any,
  assetMap: Map<string, HeliusAsset>,
  curatedAddresses: Set<string>,
  collectionAddress: string,
  collectionName: string
): ExternalMarketplaceListing | null {
  const mint =
    raw?.tokenMint ||
    raw?.mintAddress ||
    raw?.mint ||
    raw?.nftAddress ||
    null;
  if (!mint) { console.log('[normME] no mint for', raw?.tokenMint, raw?.mintAddress); return null; }

  const asset = assetMap.get(mint);
  if (!assetMatchesCuratedCollection(asset, curatedAddresses)) return null;

  const currency = getCurrencyInfo(raw?.currency || SOL_MINT);
  // ME sometimes returns price:0 while the real value is in priceInfo.solPrice or takerAmount
  const rawPriceValue =
    (raw?.price > 0 ? raw.price : null) ??
    raw?.priceInfo?.solPrice ??
    raw?.takerAmount ??
    raw?.price ??
    null;
  // ME returns prices in SOL (e.g. 19, 5.69). Convert to lamports.
  // If the value looks like display SOL (< 100_000), multiply by 1e9.
  let priceRaw = parseRawAmount(rawPriceValue);
  if (priceRaw != null && priceRaw > 0 && priceRaw < 100_000) {
    priceRaw = Math.round(priceRaw * 1e9);
  }
  // Require at least 0.001 SOL (1_000_000 lamports) to discard garbage/near-zero prices
  if (priceRaw == null || priceRaw < 1_000_000) return null;

  const seller = String(raw?.seller || raw?.owner || "");
  const isM3 = !raw?.auctionHouse || raw?.listingSource === "M3";

  return {
    id: `magiceden:${mint}`,
    source: "magiceden",
    mint,
    name: asset?.content?.metadata?.name || "Untitled",
    image:
      asset?.content?.links?.image ||
      asset?.content?.files?.[0]?.uri ||
      "/placeholder.png",
    collectionAddress,
    collectionName,
    priceRaw,
    price: toDisplayPrice(priceRaw, currency.decimals),
    currencySymbol: currency.symbol,
    currencyMint: currency.mint,
    seller,
    listedAt: normalizeTimestamp(raw?.createdAt || raw?.updatedAt),
    buyKind: isM3 ? "magicedenM3" : "magicedenM2",
    marketplaceUrl: `https://magiceden.io/item-details/${mint}`,
  };
}

function normalizeTensorListing(
  raw: any,
  assetMap: Map<string, HeliusAsset>,
  curatedAddresses: Set<string>,
  collectionAddress: string,
  collectionName: string
): ExternalMarketplaceListing | null {
  const mintInfo = raw?.mint;
  const mint =
    (typeof mintInfo === "string" ? mintInfo : null) ||
    mintInfo?.onchainId ||
    mintInfo?.id ||
    raw?.mintOnchainId ||
    raw?.onchainId ||
    raw?.id;
  if (!mint) return null;

  const asset = assetMap.get(mint);
  if (!assetMatchesCuratedCollection(asset, curatedAddresses)) return null;

  const listing = raw?.listing || raw?.activeListing || raw;
  const currency = getCurrencyInfo(
    listing?.currencyMint || listing?.currency || mintInfo?.currency || SOL_MINT
  );
  const priceRaw = parseRawAmount(
    listing?.price ??
      listing?.grossAmount ??
      listing?.maxAmount ??
      raw?.price ??
      raw?.grossAmount
  );
  if (priceRaw == null || priceRaw < 1_000_000) return null;

  const compressed =
    Boolean(asset?.compression?.compressed) ||
    Boolean(raw?.compressed) ||
    Boolean(mintInfo?.compressed);

  return {
    id: `tensor:${mint}`,
    source: "tensor",
    mint,
    name: asset?.content?.metadata?.name || "Untitled",
    image:
      asset?.content?.links?.image ||
      asset?.content?.files?.[0]?.uri ||
      "/placeholder.png",
    collectionAddress,
    collectionName,
    priceRaw,
    price: toDisplayPrice(priceRaw, currency.decimals),
    currencySymbol: currency.symbol,
    currencyMint: currency.mint,
    seller: String(listing?.seller || listing?.owner || raw?.owner || ""),
    listedAt: normalizeTimestamp(
      listing?.createdAt || listing?.updatedAt || raw?.createdAt || raw?.updatedAt
    ),
    buyKind: compressed ? "tensorCompressed" : "tensorStandard",
    marketplaceUrl: `https://www.tensor.trade/item/${mint}`,
  };
}

async function loadCuratedMarketplaceListingsFresh(
  input: GetCuratedMarketplaceListingsInput,
  limit: number
): Promise<CuratedMarketplaceListingsResult> {
  const collections = await readCuratedCollections();
  const collection = getCollectionByAddress(collections, input.collectionAddress);

  if (!collection) {
    return {
      listings: [],
      nextCursor: null,
      hasMore: false,
      state: buildMarketplaceState([], false, false),
    };
  }

  const { magicEdenSymbol, tensorCollId: tensorIdentifier } = getMarketplaceIds(collection);
  const resolvedTensorCollId = tensorIdentifier
    ? await resolveTensorCollId(tensorIdentifier)
    : null;
  const curatedAddresses = new Set(
    getSiblingCollectionAddresses(collections, input.collectionAddress)
  );
  const cursor = decodeCursor(input.cursor);
  const unavailableSources = new Set<MarketplaceSource>();

  const isFirstPage = !input.cursor;

  const [magicEdenResult, tensorResult, meCount, tensorCount] = await Promise.all([
    magicEdenSymbol && !cursor.meDone
      ? fetchMagicEdenCollectionListings(magicEdenSymbol, cursor.meOffset, limit)
          .then((page) => ({ error: null, page }))
          .catch((error) => ({
            error:
              error instanceof Error
                ? error.message
                : "Failed to load Magic Eden listings",
            page: {
              listings: [],
              nextOffset: cursor.meOffset,
              hasMore: false,
            } satisfies MagicEdenPage,
          }))
      : Promise.resolve({
          error: null,
          page: {
            listings: [],
            nextOffset: cursor.meOffset,
            hasMore: false,
          } satisfies MagicEdenPage,
        }),
    resolvedTensorCollId && !cursor.tensorDone
      ? fetchTensorCollectionListings(resolvedTensorCollId, cursor.tensorCursor || null, limit)
          .then((page) => ({ error: null, page }))
          .catch((error) => ({
            error:
              error instanceof Error
                ? error.message
                : "Failed to load Tensor listings",
            page: {
              listings: [],
              nextCursor: null,
              hasMore: false,
            } satisfies TensorPage,
          }))
      : Promise.resolve({
          error: null,
          page: {
            listings: [],
            nextCursor: null,
            hasMore: false,
          } satisfies TensorPage,
        }),
    isFirstPage && magicEdenSymbol
      ? fetchMagicEdenListedCount(magicEdenSymbol)
      : Promise.resolve(null),
    isFirstPage && resolvedTensorCollId
      ? fetchTensorListedCount(resolvedTensorCollId)
      : Promise.resolve(null),
  ]);

  const magicEdenPage = magicEdenResult.page;
  const tensorPage = tensorResult.page;

  if (magicEdenResult.error) {
    console.error("[marketplace] Magic Eden listings failed", magicEdenResult.error);
    unavailableSources.add("magiceden");
  }

  if (tensorIdentifier && !resolvedTensorCollId) {
    unavailableSources.add("tensor");
  } else if (tensorResult.error) {
    console.error("[marketplace] Tensor listings failed", tensorResult.error);
    unavailableSources.add("tensor");
  }

  const mintCandidates = [
    ...magicEdenPage.listings.map(
      (item: any) => item?.tokenMint || item?.mintAddress || item?.mint
    ),
    ...tensorPage.listings.map((item: any) => {
      const mintInfo = item?.mint;
      return (
        (typeof mintInfo === "string" ? mintInfo : null) ||
        mintInfo?.onchainId ||
        mintInfo?.id ||
        item?.mintOnchainId ||
        item?.onchainId ||
        item?.id
      );
    }),
  ].filter((value): value is string => Boolean(value));

  const { assets: assetMap, errorCount: heliusErrorCount } = await fetchHeliusAssetsByMint(
    mintCandidates
  );

  if (heliusErrorCount > 0 && mintCandidates.length > 0) {
    console.error(
      `[marketplace] Helius asset lookup failed for ${heliusErrorCount} batch(es)`
    );

    if (magicEdenPage.listings.length > 0) {
      unavailableSources.add("magiceden");
    }

    if (tensorPage.listings.length > 0) {
      unavailableSources.add("tensor");
    }
  }

  const magicEdenListings = magicEdenPage.listings
    .map((item: any) =>
      normalizeMagicEdenListing(
        item,
        assetMap,
        curatedAddresses,
        input.collectionAddress,
        collection.name
      )
    )
    .filter((value): value is ExternalMarketplaceListing => Boolean(value));

  const tensorListings = tensorPage.listings
    .map((item: any) =>
      normalizeTensorListing(
        item,
        assetMap,
        curatedAddresses,
        input.collectionAddress,
        collection.name
      )
    )
    .filter((value): value is ExternalMarketplaceListing => Boolean(value));

  console.log(
    `[marketplace] ME raw: ${magicEdenPage.listings.length}, verified: ${magicEdenListings.length}, Tensor raw: ${tensorPage.listings.length}, verified: ${tensorListings.length}, mints: ${mintCandidates.length}, assets: ${assetMap.size}`
  );

  const listings = [
    ...magicEdenListings,
    ...tensorListings,
  ].sort((left, right) => {
    if (left.priceRaw !== right.priceRaw) {
      return left.priceRaw - right.priceRaw;
    }
    return (right.listedAt || 0) - (left.listedAt || 0);
  });

  const dedupedListings = listings.filter((listing, index, allListings) => {
    return allListings.findIndex((item: ExternalMarketplaceListing) => item.id === listing.id) === index;
  });

  const nextState: MarketplaceCursor = {
    meOffset: magicEdenPage.nextOffset,
    tensorCursor: tensorPage.nextCursor || null,
    meDone: !magicEdenPage.hasMore,
    tensorDone: !tensorPage.hasMore,
  };
  const hasMore = Boolean(magicEdenPage.hasMore || tensorPage.hasMore);
  const state = buildMarketplaceState(
    Array.from(unavailableSources),
    false,
    dedupedListings.length > 0
  );

  return {
    listings: dedupedListings,
    nextCursor: hasMore ? encodeCursor(nextState) : null,
    hasMore,
    state,
    ...(isFirstPage && {
      sourceCounts: {
        magiceden:
          dedupedListings.filter((listing) => listing.source === "magiceden").length ||
          meCount,
        tensor:
          dedupedListings.filter((listing) => listing.source === "tensor").length ||
          tensorCount,
      },
    }),
  };
}

export async function getCuratedMarketplaceListings(
  input: GetCuratedMarketplaceListingsInput
): Promise<CuratedMarketplaceListingsResult> {
  const limit = normalizeMarketplaceLimit(input.limit);
  const cacheKey = createMarketplaceListingsCacheKey(input, limit);
  const cached = readExpiringCache(marketplaceListingsCache, cacheKey);

  if (cached) {
    return cached;
  }

  const pendingRequest = marketplaceListingsRequests.get(cacheKey);
  if (pendingRequest) {
    return pendingRequest;
  }

  const request = loadCuratedMarketplaceListingsFresh(
    {
      ...input,
      limit,
    },
    limit
  )
    .then((result) => {
      const fallback =
        result.state.degraded && result.listings.length === 0
          ? readExpiringCache(marketplaceListingsFallbackCache, cacheKey)
          : undefined;
      const servedResult = fallback
        ? createStaleMarketplaceResult(fallback, result.state)
        : result;

      writeExpiringCache(
        marketplaceListingsCache,
        cacheKey,
        servedResult,
        servedResult.state.degraded
          ? MARKETPLACE_LISTINGS_DEGRADED_CACHE_TTL_MS
          : MARKETPLACE_LISTINGS_CACHE_TTL_MS
      );

      if (shouldKeepMarketplaceFallback(result)) {
        writeExpiringCache(
          marketplaceListingsFallbackCache,
          cacheKey,
          result,
          MARKETPLACE_LISTINGS_STALE_TTL_MS
        );
      }

      return servedResult;
    })
    .catch((error) => {
      const fallback = readExpiringCache(marketplaceListingsFallbackCache, cacheKey);

      if (fallback) {
        const servedResult = createStaleMarketplaceResult(
          fallback,
          buildMarketplaceState([], false, fallback.listings.length > 0)
        );

        writeExpiringCache(
          marketplaceListingsCache,
          cacheKey,
          servedResult,
          MARKETPLACE_LISTINGS_DEGRADED_CACHE_TTL_MS
        );

        return servedResult;
      }

      throw error;
    })
    .finally(() => {
      marketplaceListingsRequests.delete(cacheKey);
    });

  marketplaceListingsRequests.set(cacheKey, request);
  return request;
}

async function loadCuratedMarketplaceListingFresh(
  input: GetCuratedMarketplaceListingInput
): Promise<ExternalMarketplaceListing | null> {
  const collections = await readCuratedCollections();
  const collection = getCollectionByAddress(collections, input.collectionAddress);
  if (!collection) return null;

  const curatedAddresses = new Set(
    getSiblingCollectionAddresses(collections, input.collectionAddress)
  );
  const { assets: assetMap, errorCount: heliusErrorCount } = await fetchHeliusAssetsByMint([
    input.mint,
  ]);

  if (heliusErrorCount > 0) {
    console.error("[marketplace] Failed to verify marketplace listing mint", input.mint);
  }

  if (input.source === "magiceden") {
    const response = await fetch(`${MAGIC_EDEN_API}/tokens/${input.mint}/listings`, {
      headers: ME_API_KEY ? { Authorization: `Bearer ${ME_API_KEY}` } : undefined,
      cache: "no-store",
      signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) return null;
    const listings = (await response.json()) as any[];
    return listings
      .map((item: any) =>
        normalizeMagicEdenListing(
          item,
          assetMap,
          curatedAddresses,
          input.collectionAddress,
          collection.name
        )
      )
      .filter((value): value is ExternalMarketplaceListing => Boolean(value))
      .sort((left, right) => left.priceRaw - right.priceRaw)[0] || null;
  }

  if (!process.env.TENSOR_API_KEY) {
    return null;
  }

  const response = await fetch(
    `${TENSOR_API}/mint?mints=${encodeURIComponent(input.mint)}`,
    {
      headers: {
        "x-tensor-api-key": process.env.TENSOR_API_KEY,
      },
      cache: "no-store",
      signal: AbortSignal.timeout(15000),
    }
  );

  if (response.ok) {
    const payload = await response.json();
    const mints: any[] = Array.isArray(payload?.mints) ? payload.mints : [];
    const listing =
      mints
        .map((item: any) =>
          normalizeTensorListing(
            item,
            assetMap,
            curatedAddresses,
            input.collectionAddress,
            collection.name
          )
        )
        .find(Boolean) || null;
    if (listing) return listing;
  }

  const { tensorCollId: fallbackIdentifier } = getMarketplaceIds(collection);
  if (!fallbackIdentifier) return null;

  const resolvedFallbackCollId = await resolveTensorCollId(fallbackIdentifier);
  if (!resolvedFallbackCollId) return null;

  const fallback = await fetchTensorCollectionListings(resolvedFallbackCollId, null, 60);
  return (
    fallback.listings
      .filter((item: any) => {
        const mintInfo = item?.mint;
        const mint =
          (typeof mintInfo === "string" ? mintInfo : null) ||
          mintInfo?.onchainId ||
          mintInfo?.id ||
          item?.mintOnchainId ||
          item?.onchainId ||
          item?.id;
        return mint === input.mint;
      })
      .map((item: any) =>
        normalizeTensorListing(
          item,
          assetMap,
          curatedAddresses,
          input.collectionAddress,
          collection.name
        )
      )
      .find(Boolean) || null
  );
}

export async function getCuratedMarketplaceListing(
  input: GetCuratedMarketplaceListingInput
): Promise<ExternalMarketplaceListing | null> {
  const cacheKey = createMarketplaceListingDetailCacheKey(input);
  const cached = readExpiringCache(marketplaceListingDetailCache, cacheKey);

  if (cached !== undefined) {
    return cached;
  }

  const pendingRequest = marketplaceListingDetailRequests.get(cacheKey);
  if (pendingRequest) {
    return pendingRequest;
  }

  const request = loadCuratedMarketplaceListingFresh(input)
    .then((result) =>
      writeExpiringCache(
        marketplaceListingDetailCache,
        cacheKey,
        result,
        MARKETPLACE_DETAIL_CACHE_TTL_MS
      )
    )
    .finally(() => {
      marketplaceListingDetailRequests.delete(cacheKey);
    });

  marketplaceListingDetailRequests.set(cacheKey, request);
  return request;
}
