import "server-only";

import bundledAllowlist from "@/data/allowlist.json";
import type { AllowlistEntry } from "@/lib/allowlist";
import { readFile } from "fs/promises";
import path from "path";

import {
  accumulateMarketplaceListingsPages,
  buildMarketplaceState,
  createMarketplaceListingDetailCacheKey,
  createMarketplaceListingsCacheKey,
  createStaleMarketplaceResult,
  decodeCursor,
  dedupeMarketplaceListings,
  encodeCursor,
  extractMagicEdenMint,
  extractTensorMint,
  getTensorCollectionPagination,
  getCollectionByAddress,
  getMarketplaceIds,
  getSiblingCollectionAddresses,
  normalizeMagicEdenListing,
  normalizeMarketplaceLimit,
  normalizeTensorListing,
  readExpiringCache,
  shouldKeepMarketplaceFallback,
  sortMarketplaceListings,
  writeExpiringCache,
  type CuratedCollectionFile,
  type CuratedMarketplaceListingsResult,
  type ExpiringCacheEntry,
  type ExternalMarketplaceListing,
  type GetCuratedMarketplaceListingInput,
  type GetCuratedMarketplaceListingsInput,
  type HeliusAsset,
  type HeliusAssetBatchResult,
  type MagicEdenListingRaw,
  type MagicEdenPage,
  type MarketplaceCursor,
  type MarketplaceSource,
  type TensorListingRaw,
  type TensorPage,
} from "./digital-art-marketplaces.helpers";

export {
  getCollectionAddress,
  getCollectionByAddress,
  getMarketplaceIds,
  getSiblingCollectionAddresses,
} from "./digital-art-marketplaces.helpers";
export type {
  ExternalMarketplaceListing,
  MarketplaceBuyKind,
  MarketplaceListingsState,
  MarketplaceSource,
  MarketplaceSourceCounts,
} from "./digital-art-marketplaces.helpers";

const ALLOWLIST_FILE = path.join(process.cwd(), "data", "allowlist.json");
const HELIUS_RPC = `https://mainnet.helius-rpc.com/?api-key=${process.env.HELIUS_API_KEY}`;
const MAGIC_EDEN_API = "https://api-mainnet.magiceden.dev/v2";
const TENSOR_API = "https://api.mainnet.tensordev.io/api/v1";
const ME_API_KEY = process.env.ME_API_KEY;
type TensorCollIdCacheEntry = ExpiringCacheEntry<string | null>;

interface HeliusAssetBatchResponse {
  result?: HeliusAsset[] | null;
}

interface MagicEdenStatsResponse {
  listedCount?: number | null;
}

interface TensorFindCollectionResponse {
  collId?: string | null;
}

interface TensorStatsResponseItem {
  numListed?: number | null;
}

interface TensorStatsResponseEnvelope {
  collections?: TensorStatsResponseItem[] | null;
}

type TensorStatsResponse =
  | TensorStatsResponseItem[]
  | TensorStatsResponseEnvelope
  | TensorStatsResponseItem;

interface TensorCollectionListingsResponse {
  mints?: TensorListingRaw[] | null;
  listings?: TensorListingRaw[] | null;
  nextCursor?: string | null;
  cursor?: string | null;
  page?: {
    endCursor?: string | null;
    hasMore?: boolean | null;
  } | null;
  pagination?: {
    nextCursor?: string | null;
  } | null;
}

interface TensorMintResponse {
  mints?: TensorListingRaw[] | null;
}

interface MarketplaceFetchResult<TPage> {
  error: string | null;
  page: TPage;
}

interface MarketplaceListingDetailLoadResult {
  listing: ExternalMarketplaceListing | null;
  shouldCache: boolean;
}

interface TensorMarketplaceListingLookupResult {
  listing: ExternalMarketplaceListing | null;
  unavailable: boolean;
}

function createEmptyMagicEdenPage(offset: number): MagicEdenPage {
  return {
    listings: [],
    nextOffset: offset,
    hasMore: false,
  };
}

function createEmptyTensorPage(): TensorPage {
  return {
    listings: [],
    nextCursor: null,
    hasMore: false,
  };
}

function getTensorStatsItem(
  payload: TensorStatsResponse
): TensorStatsResponseItem | undefined {
  if (Array.isArray(payload)) {
    return payload[0];
  }

  if ("collections" in payload && Array.isArray(payload.collections)) {
    return payload.collections[0] ?? undefined;
  }

  return "numListed" in payload ? payload : undefined;
}

const BUNDLED_ALLOWLIST: CuratedCollectionFile = bundledAllowlist;

const TENSOR_COLL_ID_SUCCESS_TTL_MS = 15 * 60 * 1000;
const TENSOR_COLL_ID_EMPTY_TTL_MS = 5 * 60 * 1000;
const TENSOR_COLL_ID_ERROR_TTL_MS = 30 * 1000;
const TENSOR_COLL_ID_LOOKUP_TIMEOUT_MS = 3_000;
const MARKETPLACE_LISTINGS_CACHE_TTL_MS = 120 * 1000;
const MARKETPLACE_LISTINGS_DEGRADED_CACHE_TTL_MS = 10 * 1000;
const MARKETPLACE_LISTINGS_STALE_TTL_MS = 5 * 60 * 1000;
const MARKETPLACE_DETAIL_CACHE_TTL_MS = 15 * 1000;
const MAX_MARKETPLACE_PAGE_PASSES = 4;
const MAX_TENSOR_DETAIL_FALLBACK_PASSES = 4;
const TENSOR_DETAIL_FALLBACK_PAGE_SIZE = 60;
const TENSOR_RATE_LIMIT_BACKOFF_MS = 60_000;

function isTransientMarketplaceStatus(status: number): boolean {
  return status === 408 || status === 429 || status >= 500;
}

function getMarketplaceErrorReason(error: unknown): string {
  return error instanceof Error ? `${error.name}: ${error.message}` : String(error);
}

class TensorRateLimitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TensorRateLimitError";
  }
}

function normalizeTensorMarketplaceListingCandidate(
  raw: TensorListingRaw,
  assetMap: Map<string, HeliusAsset>,
  curatedAddresses: ReadonlySet<string>,
  collectionAddress: string,
  collectionName: string
): ExternalMarketplaceListing | null {
  return normalizeTensorListing(
    raw,
    assetMap,
    curatedAddresses,
    collectionAddress,
    collectionName
  );
}

async function fetchTensorMarketplaceListingByMint(input: {
  assetMap: Map<string, HeliusAsset>;
  collectionAddress: string;
  collectionName: string;
  curatedAddresses: ReadonlySet<string>;
  mint: string;
}): Promise<TensorMarketplaceListingLookupResult> {
  if (!process.env.TENSOR_API_KEY) {
    return { listing: null, unavailable: false };
  }

  try {
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

    if (!response.ok) {
      if (isTransientMarketplaceStatus(response.status)) {
        console.warn(
          `[marketplace] Tensor mint detail unavailable for ${input.mint}: ${response.status}`
        );
      }

      return {
        listing: null,
        unavailable: isTransientMarketplaceStatus(response.status),
      };
    }

    const payload: TensorMintResponse = await response.json();
    const mints = Array.isArray(payload.mints) ? payload.mints : [];
    const listing =
      mints
        .map((item) =>
          normalizeTensorMarketplaceListingCandidate(
            item,
            input.assetMap,
            input.curatedAddresses,
            input.collectionAddress,
            input.collectionName
          )
        )
        .find(Boolean) || null;

    return { listing, unavailable: false };
  } catch (error) {
    console.warn(
      `[marketplace] Tensor mint detail unavailable for ${input.mint}: ${getMarketplaceErrorReason(error)}`
    );

    return { listing: null, unavailable: true };
  }
}

async function searchTensorMarketplaceListingInCollection(input: {
  assetMap: Map<string, HeliusAsset>;
  collId: string;
  collectionAddress: string;
  collectionName: string;
  curatedAddresses: ReadonlySet<string>;
  mint: string;
}): Promise<TensorMarketplaceListingLookupResult> {
  let cursor: string | null = null;

  for (let pass = 0; pass < MAX_TENSOR_DETAIL_FALLBACK_PASSES; pass += 1) {
    let page: TensorPage;

    try {
      page = await fetchTensorCollectionListings(
        input.collId,
        cursor,
        TENSOR_DETAIL_FALLBACK_PAGE_SIZE
      );
    } catch (error) {
      console.warn(
        `[marketplace] Tensor collection fallback unavailable for ${input.mint}: ${getMarketplaceErrorReason(error)}`
      );

      return { listing: null, unavailable: true };
    }

    const match = page.listings.find((item) => extractTensorMint(item) === input.mint);

    if (match) {
      return {
        listing: normalizeTensorMarketplaceListingCandidate(
          match,
          input.assetMap,
          input.curatedAddresses,
          input.collectionAddress,
          input.collectionName
        ),
        unavailable: false,
      };
    }

    if (!page.hasMore || !page.nextCursor || page.nextCursor === cursor) {
      break;
    }

    cursor = page.nextCursor;
  }

  return { listing: null, unavailable: false };
}

export function __resetDigitalArtMarketplaceCachesForTests(): void {
  tensorApiRateLimitedUntilMs = 0;
  tensorCollIdCache.clear();
  tensorCollIdRequests.clear();
  marketplaceListingsCache.clear();
  marketplaceListingsFallbackCache.clear();
  marketplaceListingsRequests.clear();
  marketplaceListingDetailCache.clear();
  marketplaceListingDetailRequests.clear();
}

export async function readCuratedCollections(): Promise<AllowlistEntry[]> {
  try {
    const content = await readFile(ALLOWLIST_FILE, "utf-8");
    const parsed = JSON.parse(content) as CuratedCollectionFile;
    return parsed.collections || [];
  } catch {
    return BUNDLED_ALLOWLIST.collections || [];
  }
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

      const payload: HeliusAssetBatchResponse = await response.json();
      const result = Array.isArray(payload.result) ? payload.result : [];
      for (const item of result) {
        if (item.id) {
          assets.set(item.id, item);
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
    const data: MagicEdenStatsResponse = await response.json();
    return typeof data.listedCount === "number" ? data.listedCount : null;
  } catch {
    return null;
  }
}

// Tracks when a Tensor API rate-limit (429) was last encountered so all
// subsequent calls skip the API until the backoff window expires.
let tensorApiRateLimitedUntilMs = 0;

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
          signal: AbortSignal.timeout(TENSOR_COLL_ID_LOOKUP_TIMEOUT_MS),
        }
      );

      if (!response.ok) {
        console.log(`[tensor] find_collection failed for ${identifier}: ${response.status}`);
        return writeTensorCollIdCache(identifier, null, TENSOR_COLL_ID_ERROR_TTL_MS);
      }

      const data: TensorFindCollectionResponse = await response.json();
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
      const reason = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
      console.warn(`[tensor] find_collection unavailable for ${identifier}: ${reason}`);
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
    const data: TensorStatsResponse = await response.json();
    const stats = getTensorStatsItem(data);
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

  const payload: MagicEdenListingRaw[] | null = await response.json();
  const listings = Array.isArray(payload) ? payload : [];
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
  const tensorApiKey = process.env.TENSOR_API_KEY;

  if (!tensorApiKey) {
    return { listings: [], nextCursor: null, hasMore: false };
  }

  if (Date.now() < tensorApiRateLimitedUntilMs) {
    throw new TensorRateLimitError("Tensor API rate limit backoff active");
  }

  const params = new URLSearchParams({
    collId,
    sortBy: "ListingPriceAsc",
    onlyListings: "true",
    limit: String(limit),
  });
  if (cursor) params.set("cursor", cursor);

  const fetchPage = () =>
    fetch(`${TENSOR_API}/mint/collection?${params.toString()}`, {
      headers: { "x-tensor-api-key": tensorApiKey },
      cache: "no-store",
      signal: AbortSignal.timeout(15000),
    });

  let response = await fetchPage();

  if (response.status === 429) {
    const retryAfterHeader = response.headers.get("Retry-After");
    const retryAfterMs = retryAfterHeader
      ? Math.min(parseFloat(retryAfterHeader) * 1000, 5_000)
      : 2_000;
    await new Promise<void>((resolve) => setTimeout(resolve, retryAfterMs));
    response = await fetchPage();
  }

  if (!response.ok) {
    if (response.status === 429) {
      tensorApiRateLimitedUntilMs = Date.now() + TENSOR_RATE_LIMIT_BACKOFF_MS;
      throw new TensorRateLimitError(`Tensor listings request failed with status 429`);
    }
    throw new Error(`Tensor listings request failed with status ${response.status}`);
  }

  const payload: TensorCollectionListingsResponse = await response.json();
  const listings = Array.isArray(payload.mints)
    ? payload.mints
    : Array.isArray(payload.listings)
      ? payload.listings
      : [];
  const { hasMore, nextCursor } = getTensorCollectionPagination(payload);

  return {
    listings,
    nextCursor,
    hasMore,
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

  const { magicEdenSymbol, tensorIdentifiers } = getMarketplaceIds(collection);
  const resolvedTensorCollIds = await Promise.all(
    tensorIdentifiers.map((id) => resolveTensorCollId(id))
  );
  const validTensorSlots = tensorIdentifiers
    .map((identifier, i) => ({ identifier, collId: resolvedTensorCollIds[i] }))
    .filter((slot): slot is { identifier: string; collId: string } => slot.collId !== null);
  const validTensorCollIds = validTensorSlots.map((slot) => slot.collId);
  const curatedAddresses = new Set(
    getSiblingCollectionAddresses(collections, input.collectionAddress)
  );
  const unavailableSources = new Set<MarketplaceSource>();
  const isFirstPage = !input.cursor;
  const initialCursor = decodeCursor(input.cursor);
  const shouldIncludeMagicEden = input.source !== "tensor";
  const shouldIncludeTensor = input.source !== "magiceden";

  if (shouldIncludeTensor && tensorIdentifiers.length > 0 && validTensorCollIds.length === 0) {
    unavailableSources.add("tensor");
  }

  const [meCount, tensorCount] = await Promise.all([
    isFirstPage && !input.source && magicEdenSymbol
      ? fetchMagicEdenListedCount(magicEdenSymbol)
      : Promise.resolve(null),
    isFirstPage && !input.source && validTensorCollIds.length > 0
      ? Promise.all(validTensorCollIds.map(fetchTensorListedCount)).then((counts) =>
          counts.reduce<number | null>(
            (sum, c) => (c !== null ? (sum ?? 0) + c : sum),
            null
          )
        )
      : Promise.resolve(null),
  ] as const);

  const accumulatedResult = await accumulateMarketplaceListingsPages({
    initialCursor,
    maxPasses: MAX_MARKETPLACE_PAGE_PASSES,
    minListings: 1,
    loadPage: async (cursor) => {
      const tensorSlotCount = validTensorCollIds.length;
      const activeTensorCursors: (string | null)[] =
        Array.isArray(cursor.tensorCursors) && cursor.tensorCursors.length === tensorSlotCount
          ? cursor.tensorCursors
          : validTensorCollIds.map((_, i) => (i === 0 ? cursor.tensorCursor : null));
      const activeTensorDones: boolean[] =
        Array.isArray(cursor.tensorDones) && cursor.tensorDones.length === tensorSlotCount
          ? cursor.tensorDones
          : validTensorCollIds.map((_, i) => (i === 0 ? cursor.tensorDone : false));

      const magicEdenRequest: Promise<MarketplaceFetchResult<MagicEdenPage>> =
        shouldIncludeMagicEden && magicEdenSymbol && !cursor.meDone
          ? fetchMagicEdenCollectionListings(magicEdenSymbol, cursor.meOffset, limit)
              .then((page) => ({ error: null, page }))
              .catch((error) => ({
                error:
                  error instanceof Error
                    ? error.message
                    : "Failed to load Magic Eden listings",
                page: createEmptyMagicEdenPage(cursor.meOffset),
              }))
          : Promise.resolve({
              error: null,
              page: createEmptyMagicEdenPage(cursor.meOffset),
            });

      const isTensorRateLimited = Date.now() < tensorApiRateLimitedUntilMs;

      const tensorRequests: Promise<MarketplaceFetchResult<TensorPage>>[] =
        validTensorCollIds.map((collId, index) =>
          shouldIncludeTensor && !activeTensorDones[index] && !isTensorRateLimited
            ? fetchTensorCollectionListings(collId, activeTensorCursors[index] ?? null, limit)
                .then((page) => ({ error: null, page }))
                .catch((error) => ({
                  error:
                    error instanceof Error
                      ? error.message
                      : "Failed to load Tensor listings",
                  page: createEmptyTensorPage(),
                }))
            : Promise.resolve({
                error: isTensorRateLimited ? "Tensor API rate limit backoff active" : null,
                page: createEmptyTensorPage(),
              })
        );

      const [magicEdenResult, tensorResultsAll] = await Promise.all([
        magicEdenRequest,
        Promise.all(tensorRequests),
      ]);
      const pageUnavailableSources = new Set<MarketplaceSource>();
      const magicEdenPage = magicEdenResult.page;

      if (magicEdenResult.error) {
        console.error("[marketplace] Magic Eden listings failed", magicEdenResult.error);
        pageUnavailableSources.add("magiceden");
      }

      const allTensorRawListings: { raw: TensorListingRaw; slug: string }[] = [];
      const nextTensorCursors: (string | null)[] = [...activeTensorCursors];
      const nextTensorDones: boolean[] = [...activeTensorDones];
      let anyTensorHasMore = false;

      for (const [i, tensorResult] of tensorResultsAll.entries()) {
        if (tensorResult.error) {
          console.error("[marketplace] Tensor listings failed", tensorResult.error);
          pageUnavailableSources.add("tensor");
        }
        const slug = validTensorSlots[i]?.identifier ?? "";
        for (const raw of tensorResult.page.listings) {
          allTensorRawListings.push({ raw, slug });
        }
        nextTensorCursors[i] = shouldIncludeTensor
          ? (tensorResult.page.nextCursor ?? null)
          : activeTensorCursors[i];
        nextTensorDones[i] = shouldIncludeTensor
          ? !tensorResult.page.hasMore
          : activeTensorDones[i];
        if (tensorResult.page.hasMore) anyTensorHasMore = true;
      }

      const mintCandidates = [
        ...magicEdenPage.listings.map(extractMagicEdenMint),
        ...allTensorRawListings.map(({ raw }) => extractTensorMint(raw)),
      ].filter((value): value is string => Boolean(value));

      const { assets: assetMap, errorCount: heliusErrorCount } =
        await fetchHeliusAssetsByMint(mintCandidates);

      if (heliusErrorCount > 0 && mintCandidates.length > 0) {
        console.error(
          `[marketplace] Helius asset lookup failed for ${heliusErrorCount} batch(es)`
        );

        if (magicEdenPage.listings.length > 0) {
          pageUnavailableSources.add("magiceden");
        }

        if (allTensorRawListings.length > 0) {
          pageUnavailableSources.add("tensor");
        }
      }

      const magicEdenListings = magicEdenPage.listings
        .map((item) =>
          normalizeMagicEdenListing(
            item,
            assetMap,
            curatedAddresses,
            input.collectionAddress,
            collection.name
          )
        )
        .filter((value): value is ExternalMarketplaceListing => Boolean(value));

      const tensorListings = allTensorRawListings
        .map(({ raw, slug }) =>
          normalizeTensorListing(
            raw,
            assetMap,
            curatedAddresses,
            input.collectionAddress,
            collection.name,
            slug
          )
        )
        .filter((value): value is ExternalMarketplaceListing => Boolean(value));

      console.log(
        `[marketplace] ME raw: ${magicEdenPage.listings.length}, verified: ${magicEdenListings.length}, Tensor raw: ${allTensorRawListings.length}, verified: ${tensorListings.length}, mints: ${mintCandidates.length}, assets: ${assetMap.size}`
      );

      const scopedListings = input.source === "magiceden"
        ? magicEdenListings
        : input.source === "tensor"
          ? tensorListings
          : [...magicEdenListings, ...tensorListings];

      const hasMore = input.source === "magiceden"
        ? magicEdenPage.hasMore
        : input.source === "tensor"
          ? anyTensorHasMore
          : Boolean(magicEdenPage.hasMore || anyTensorHasMore);

      return {
        hasMore,
        listings: dedupeMarketplaceListings(sortMarketplaceListings(scopedListings)),
        nextCursor: {
          meOffset: shouldIncludeMagicEden ? magicEdenPage.nextOffset : cursor.meOffset,
          meDone: shouldIncludeMagicEden ? !magicEdenPage.hasMore : cursor.meDone,
          tensorCursor: nextTensorCursors[0] ?? null,
          tensorDone: nextTensorDones[0] ?? true,
          tensorCursors: nextTensorCursors,
          tensorDones: nextTensorDones,
        },
        unavailableSources: Array.from(pageUnavailableSources),
      };
    },
  });

  const dedupedListings = accumulatedResult.listings;
  const state = buildMarketplaceState(
    Array.from(new Set([...unavailableSources, ...accumulatedResult.unavailableSources])),
    false,
    dedupedListings.length > 0
  );

  return {
    listings: dedupedListings,
    nextCursor: accumulatedResult.nextCursor
      ? encodeCursor(accumulatedResult.nextCursor)
      : null,
    hasMore: accumulatedResult.hasMore,
    state,
    ...(isFirstPage && !input.source && {
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
): Promise<MarketplaceListingDetailLoadResult> {
  const collections = await readCuratedCollections();
  const collection = getCollectionByAddress(collections, input.collectionAddress);
  if (!collection) {
    return {
      listing: null,
      shouldCache: true,
    };
  }

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
    try {
      const response = await fetch(`${MAGIC_EDEN_API}/tokens/${input.mint}/listings`, {
        headers: ME_API_KEY ? { Authorization: `Bearer ${ME_API_KEY}` } : undefined,
        cache: "no-store",
        signal: AbortSignal.timeout(15000),
      });

      if (!response.ok) {
        return {
          listing: null,
          shouldCache: !isTransientMarketplaceStatus(response.status),
        };
      }

      const payload: MagicEdenListingRaw[] | null = await response.json();
      const listings = Array.isArray(payload) ? payload : [];

      return {
        listing:
          listings
            .map((item) =>
              normalizeMagicEdenListing(
                item,
                assetMap,
                curatedAddresses,
                input.collectionAddress,
                collection.name
              )
            )
            .filter((value): value is ExternalMarketplaceListing => Boolean(value))
            .sort((left, right) => left.priceRaw - right.priceRaw)[0] || null,
        shouldCache: true,
      };
    } catch (error) {
      console.warn(
        `[marketplace] Magic Eden listing detail unavailable for ${input.mint}: ${getMarketplaceErrorReason(error)}`
      );

      return {
        listing: null,
        shouldCache: false,
      };
    }
  }

  if (!process.env.TENSOR_API_KEY) {
    return {
      listing: null,
      shouldCache: true,
    };
  }

  const directResult = await fetchTensorMarketplaceListingByMint({
    assetMap,
    collectionAddress: input.collectionAddress,
    collectionName: collection.name,
    curatedAddresses,
    mint: input.mint,
  });

  if (directResult.listing) {
    return {
      listing: directResult.listing,
      shouldCache: true,
    };
  }

  const { tensorIdentifiers } = getMarketplaceIds(collection);
  const fallbackIdentifier = tensorIdentifiers[0];
  if (!fallbackIdentifier) {
    return {
      listing: null,
      shouldCache: !directResult.unavailable,
    };
  }

  const resolvedFallbackCollId = await resolveTensorCollId(fallbackIdentifier);
  if (!resolvedFallbackCollId) {
    return {
      listing: null,
      shouldCache: !directResult.unavailable,
    };
  }

  const fallbackResult = await searchTensorMarketplaceListingInCollection({
    assetMap,
    collId: resolvedFallbackCollId,
    collectionAddress: input.collectionAddress,
    collectionName: collection.name,
    curatedAddresses,
    mint: input.mint,
  });

  return {
    listing: fallbackResult.listing,
    shouldCache: !(directResult.unavailable || fallbackResult.unavailable),
  };
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
      result.shouldCache
        ? writeExpiringCache(
            marketplaceListingDetailCache,
            cacheKey,
            result.listing,
            MARKETPLACE_DETAIL_CACHE_TTL_MS
          )
        : result.listing
    )
    .finally(() => {
      marketplaceListingDetailRequests.delete(cacheKey);
    });

  marketplaceListingDetailRequests.set(cacheKey, request);
  return request;
}
