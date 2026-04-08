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

const BUNDLED_ALLOWLIST =
  bundledAllowlist as unknown as CuratedCollectionFile;

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
  tensorSlug?: string;
} {
  const magicEdenSymbol = entry.marketplaces?.magicEden?.symbol;
  const tensorSlug =
    entry.marketplaces?.tensor?.slug || entry.marketplaces?.magicEden?.symbol;
  return { magicEdenSymbol, tensorSlug };
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

async function fetchHeliusAssetsByMint(mints: string[]): Promise<Map<string, HeliusAsset>> {
  const uniqueMints = Array.from(new Set(mints.filter(Boolean)));
  const assets = new Map<string, HeliusAsset>();

  if (!uniqueMints.length || !process.env.HELIUS_API_KEY) {
    return assets;
  }

  for (let index = 0; index < uniqueMints.length; index += 100) {
    const chunk = uniqueMints.slice(index, index + 100);
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

    if (!response.ok) continue;
    const payload = await response.json();
    for (const item of payload.result || []) {
      if (item?.id) {
        assets.set(item.id, item as HeliusAsset);
      }
    }
  }

  return assets;
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

async function fetchTensorListedCount(slug: string): Promise<number | null> {
  if (!process.env.TENSOR_API_KEY) return null;
  try {
    const response = await fetch(
      `${TENSOR_API}/collections/stats?slugs=${encodeURIComponent(slug)}`,
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
    return { listings: [], nextOffset: offset, hasMore: false };
  }

  const listings = (await response.json()) as any[];
  return {
    listings,
    nextOffset: offset + listings.length,
    hasMore: listings.length >= limit,
  };
}

async function fetchTensorCollectionListings(
  slug: string,
  cursor: string | null,
  limit: number
): Promise<TensorPage> {
  if (!process.env.TENSOR_API_KEY) {
    return { listings: [], nextCursor: null, hasMore: false };
  }

  const params = new URLSearchParams({
    slug,
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
    return { listings: [], nextCursor: null, hasMore: false };
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

export async function getCuratedMarketplaceListings(input: {
  collectionAddress: string;
  cursor?: string | null;
  limit?: number;
}): Promise<{
  listings: ExternalMarketplaceListing[];
  nextCursor: string | null;
  hasMore: boolean;
  sourceCounts?: { magiceden: number | null; tensor: number | null };
}> {
  const limit = Math.min(Math.max(input.limit || 12, 1), 40);
  const collections = await readCuratedCollections();
  const collection = getCollectionByAddress(collections, input.collectionAddress);

  if (!collection) {
    return { listings: [], nextCursor: null, hasMore: false };
  }

  const { magicEdenSymbol, tensorSlug } = getMarketplaceIds(collection);
  const curatedAddresses = new Set(
    getSiblingCollectionAddresses(collections, input.collectionAddress)
  );
  const cursor = decodeCursor(input.cursor);

  const isFirstPage = !input.cursor;

  const [magicEdenPage, tensorPage, meCount, tensorCount] = await Promise.all([
    magicEdenSymbol && !cursor.meDone
      ? fetchMagicEdenCollectionListings(magicEdenSymbol, cursor.meOffset, limit)
      : Promise.resolve({ listings: [], nextOffset: cursor.meOffset, hasMore: false }),
    tensorSlug && !cursor.tensorDone
      ? fetchTensorCollectionListings(tensorSlug, cursor.tensorCursor || null, limit)
      : Promise.resolve({ listings: [], nextCursor: null, hasMore: false }),
    isFirstPage && magicEdenSymbol ? fetchMagicEdenListedCount(magicEdenSymbol) : Promise.resolve(null),
    isFirstPage && tensorSlug ? fetchTensorListedCount(tensorSlug) : Promise.resolve(null),
  ]);

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

  const assetMap = await fetchHeliusAssetsByMint(mintCandidates);

  console.log(`[marketplace] ME raw: ${magicEdenPage.listings.length}, Tensor raw: ${tensorPage.listings.length}, mints: ${mintCandidates.length}, assets: ${assetMap.size}`);

  const listings = [
    ...magicEdenPage.listings
      .map((item: any) =>
        normalizeMagicEdenListing(
          item,
          assetMap,
          curatedAddresses,
          input.collectionAddress,
          collection.name
        )
      )
      .filter((value): value is ExternalMarketplaceListing => Boolean(value)),
    ...tensorPage.listings
      .map((item: any) =>
        normalizeTensorListing(
          item,
          assetMap,
          curatedAddresses,
          input.collectionAddress,
          collection.name
        )
      )
      .filter((value): value is ExternalMarketplaceListing => Boolean(value)),
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

  return {
    listings: dedupedListings,
    nextCursor: hasMore ? encodeCursor(nextState) : null,
    hasMore,
    ...(isFirstPage && {
      sourceCounts: {
        magiceden: dedupedListings.filter(l => l.source === 'magiceden').length || meCount,
        tensor: dedupedListings.filter(l => l.source === 'tensor').length || tensorCount,
      },
    }),
  };
}

export async function getCuratedMarketplaceListing(input: {
  collectionAddress: string;
  source: MarketplaceSource;
  mint: string;
}): Promise<ExternalMarketplaceListing | null> {
  const collections = await readCuratedCollections();
  const collection = getCollectionByAddress(collections, input.collectionAddress);
  if (!collection) return null;

  const curatedAddresses = new Set(
    getSiblingCollectionAddresses(collections, input.collectionAddress)
  );
  const assetMap = await fetchHeliusAssetsByMint([input.mint]);

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

  const { tensorSlug } = getMarketplaceIds(collection);
  if (!tensorSlug) return null;

  const fallback = await fetchTensorCollectionListings(tensorSlug, null, 60);
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
