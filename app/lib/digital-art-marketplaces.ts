import "server-only";

import bundledAllowlist from "@/data/allowlist.json";
import type { AllowlistEntry } from "@/lib/allowlist";
import { readFile } from "fs/promises";
import path from "path";

import {
  buildMarketplaceState,
  createMarketplaceListingDetailCacheKey,
  createMarketplaceListingsCacheKey,
  createStaleMarketplaceResult,
  decodeCursor,
  dedupeMarketplaceListings,
  encodeCursor,
  extractMagicEdenMint,
  extractTensorMint,
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

  const payload: TensorCollectionListingsResponse = await response.json();
  const listings = Array.isArray(payload.mints)
    ? payload.mints
    : Array.isArray(payload.listings)
      ? payload.listings
      : [];

  const nextCursor =
    payload.nextCursor ||
    payload.cursor ||
    payload.pagination?.nextCursor ||
    null;

  return {
    listings,
    nextCursor,
    hasMore: Boolean(nextCursor),
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

  const magicEdenRequest: Promise<MarketplaceFetchResult<MagicEdenPage>> =
    magicEdenSymbol && !cursor.meDone
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

  const tensorRequest: Promise<MarketplaceFetchResult<TensorPage>> =
    resolvedTensorCollId && !cursor.tensorDone
      ? fetchTensorCollectionListings(resolvedTensorCollId, cursor.tensorCursor || null, limit)
          .then((page) => ({ error: null, page }))
          .catch((error) => ({
            error:
              error instanceof Error
                ? error.message
                : "Failed to load Tensor listings",
            page: createEmptyTensorPage(),
          }))
      : Promise.resolve({
          error: null,
          page: createEmptyTensorPage(),
        });

  const [magicEdenResult, tensorResult, meCount, tensorCount] = await Promise.all([
    magicEdenRequest,
    tensorRequest,
    isFirstPage && magicEdenSymbol
      ? fetchMagicEdenListedCount(magicEdenSymbol)
      : Promise.resolve(null),
    isFirstPage && resolvedTensorCollId
      ? fetchTensorListedCount(resolvedTensorCollId)
      : Promise.resolve(null),
  ] as const);

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
    ...magicEdenPage.listings.map(extractMagicEdenMint),
    ...tensorPage.listings.map(extractTensorMint),
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

  const tensorListings = tensorPage.listings
    .map((item) =>
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

  const dedupedListings = dedupeMarketplaceListings(
    sortMarketplaceListings([...magicEdenListings, ...tensorListings])
  );

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
    const payload: MagicEdenListingRaw[] | null = await response.json();
    const listings = Array.isArray(payload) ? payload : [];
    return listings
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
    const payload: TensorMintResponse = await response.json();
    const mints = Array.isArray(payload.mints) ? payload.mints : [];
    const listing =
      mints
        .map((item) =>
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
      .filter((item) => extractTensorMint(item) === input.mint)
      .map((item) =>
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
