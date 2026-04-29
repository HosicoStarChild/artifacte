import { Connection, PublicKey } from "@solana/web3.js";
import * as anchor from "@coral-xyz/anchor";

import { resolveHomeImageSrc } from "@/lib/home-image";

const bs58Encode = (data: Buffer | Uint8Array): string =>
  anchor.utils.bytes.bs58.encode(data instanceof Buffer ? data : Buffer.from(data));

const AUCTION_PROGRAM_ID = new PublicKey("81s1tEx4MPdVvqS6X84Mok5K4N5fMbRLzcsT5eo2K8J3");
const ARTIFACTE_AUTHORITY = "DDSpvAK8DbuAdEaaBHkfLieLPSJVCWWgquFAA3pvxXoX";
const ARTIFACTE_COLLECTION_ID = "jzkJTGAuDcWthM91S1ch7wPcfMUQB5CdYH6hA25K4CS";
const LISTING_ACCOUNT_SIZE = 240;
const OFFSET_SELLER = 8;
const OFFSET_NFT_MINT = 40;
const OFFSET_PRICE = 104;
const OFFSET_LISTING_TYPE = 112;
const OFFSET_STATUS = 130;
const ARTIFACTE_LISTINGS_CACHE_TTL = 30_000;
const DAS_BATCH_SIZE = 100;
const RPC_REQUEST_TIMEOUT_MS = 10_000;
const DEFAULT_SOLANA_RPC_URL = "https://api.mainnet-beta.solana.com";
const DEFAULT_ARTIFACTE_SITE_URL = "https://artifacte.io";

// Core listing layout (153 bytes total):
//   8 (discriminator) + 32 seller + 32 asset + 32 collection + 32 payment_mint
//   + 8 price + 8 created_at + 1 bump
const CORE_LISTING_DISCRIMINATOR = Buffer.from([205, 178, 162, 169, 199, 166, 133, 157]);
const CORE_LISTING_SIZE = 153;
const CORE_OFFSET_SELLER = 8;
const CORE_OFFSET_ASSET = 8 + 32;
const CORE_OFFSET_COLLECTION = 8 + 32 + 32;
const CORE_OFFSET_PRICE = 8 + 32 + 32 + 32 + 32;

type ActiveMint = { isCore: boolean; nftMint: string; price: bigint; seller: string; collection?: string };

type HeliusAuthority = { address?: string };
type HeliusAttribute = { trait_type?: string; value?: string };
type HeliusFile = { cdn_uri?: string; uri?: string };
type HeliusOwnership = { owner?: string };
type HeliusAsset = {
  id?: string;
  authorities?: HeliusAuthority[];
  ownership?: HeliusOwnership;
  content?: {
    metadata?: {
      name?: string;
      attributes?: HeliusAttribute[];
    };
    files?: HeliusFile[];
    links?: {
      image?: string;
    };
  };
};

export interface ArtifacteProgramListing {
  id: string;
  isCore: boolean;
  nftAddress: string;
  name: string;
  subtitle: string;
  image: string;
  owner?: string;
  price: number;
  seller: string;
  usdcPrice: number;
  currency: "USDC";
  source: "artifacte";
  marketplace: "artifacte";
}

let listingsCache: { ts: number; listings: ArtifacteProgramListing[] } | null = null;

function normalizeConfiguredUrl(value?: string | null): string | null {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

function getHeliusRpcUrl(): string | null {
  const explicitRpcUrl = normalizeConfiguredUrl(process.env.HELIUS_RPC_URL);
  if (explicitRpcUrl) {
    return explicitRpcUrl;
  }

  const apiKey = normalizeConfiguredUrl(process.env.HELIUS_API_KEY);
  if (!apiKey) {
    return null;
  }

  return `https://mainnet.helius-rpc.com/?api-key=${apiKey}`;
}

function getSolanaRpcUpstreamUrls(): string[] {
  return [
    normalizeConfiguredUrl(process.env.SOLANA_RPC_URL),
    normalizeConfiguredUrl(process.env.SOLANA_RPC_URL_MAINNET),
    normalizeConfiguredUrl(process.env.NEXT_PUBLIC_SOLANA_RPC_URL),
    normalizeConfiguredUrl(process.env.NEXT_PUBLIC_SOLANA_RPC_URL_MAINNET),
    getHeliusRpcUrl(),
    DEFAULT_SOLANA_RPC_URL,
  ].filter((url, index, urls): url is string => Boolean(url) && urls.indexOf(url) === index);
}

function getHeliusDasUpstreamUrls(): string[] {
  return [getHeliusRpcUrl()].filter((url, index, urls): url is string => Boolean(url) && urls.indexOf(url) === index);
}

function withTimeout(timeoutMs = RPC_REQUEST_TIMEOUT_MS): AbortSignal {
  return AbortSignal.timeout(timeoutMs);
}

function getArtifacteListingsFallbackUrl(): string | null {
  if (process.env.NODE_ENV === "production") {
    return null;
  }

  const baseUrl = normalizeConfiguredUrl(process.env.NEXT_PUBLIC_SITE_URL) || DEFAULT_ARTIFACTE_SITE_URL;
  return `${baseUrl.replace(/\/$/, "")}/api/artifacte-program-listings?perPage=100&sort=price-desc`;
}

function getAssetAttributes(asset: HeliusAsset): HeliusAttribute[] {
  const attributes = asset.content?.metadata?.attributes;
  return Array.isArray(attributes) ? attributes : [];
}

function getAttributeValue(asset: HeliusAsset, traitType: string): string {
  const attribute = getAssetAttributes(asset).find((item) => item.trait_type === traitType);
  return typeof attribute?.value === "string" ? attribute.value : "";
}

function normalizeImage(image: string): string {
  if (!image) return "/placeholder.png";

  let normalized = image;
  if (normalized.startsWith("ipfs://")) {
    normalized = normalized.replace("ipfs://", "https://nftstorage.link/ipfs/");
  }

  return resolveHomeImageSrc(normalized) ?? normalized;
}

function buildListingFromAsset(activeMint: ActiveMint, asset: HeliusAsset): ArtifacteProgramListing | null {
  if (activeMint.isCore && activeMint.collection !== ARTIFACTE_COLLECTION_ID) {
    return null;
  }

  const authorities = Array.isArray(asset.authorities) ? asset.authorities : [];
  if (!authorities.some((authority) => authority.address === ARTIFACTE_AUTHORITY)) {
    return null;
  }

  const assetOwner = asset.ownership?.owner;
  if (activeMint.isCore && assetOwner && assetOwner !== activeMint.seller) {
    return null;
  }

  const name = asset.content?.metadata?.name?.trim() || "Unnamed";
  const subtitle = getAttributeValue(asset, "Card Name") || getAttributeValue(asset, "Set");
  const image = normalizeImage(
    asset.content?.files?.[0]?.cdn_uri ||
      asset.content?.files?.[0]?.uri ||
      asset.content?.links?.image ||
      "/placeholder.png"
  );
  const usdcPrice = Number(activeMint.price) / 1e6;

  return {
    id: activeMint.nftMint,
    isCore: activeMint.isCore,
    nftAddress: activeMint.nftMint,
    name,
    subtitle,
    image,
    owner: asset.ownership?.owner,
    price: usdcPrice,
    seller: activeMint.seller,
    usdcPrice,
    currency: "USDC",
    source: "artifacte",
    marketplace: "artifacte",
  };
}

async function fetchAssetMap(heliusRpc: string, mintAddresses: string[]): Promise<Map<string, HeliusAsset>> {
  const assetMap = new Map<string, HeliusAsset>();

  for (let index = 0; index < mintAddresses.length; index += DAS_BATCH_SIZE) {
    const batch = mintAddresses.slice(index, index + DAS_BATCH_SIZE);
    const response = await fetch(heliusRpc, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: `artifacte-batch-${index / DAS_BATCH_SIZE}`,
        method: "getAssetBatch",
        params: { ids: batch },
      }),
      signal: withTimeout(),
    });

    if (!response.ok) {
      throw new Error(`Helius DAS returned ${response.status}`);
    }

    const payload = (await response.json()) as { result?: HeliusAsset[] };
    const assets = Array.isArray(payload.result) ? payload.result : [];
    for (const asset of assets) {
      if (asset?.id) assetMap.set(asset.id, asset);
    }
  }

  return assetMap;
}

async function fetchActiveArtifacteMints(connection: Connection): Promise<ActiveMint[]> {
  const accounts = await connection.getProgramAccounts(AUCTION_PROGRAM_ID, {
    filters: [{ dataSize: LISTING_ACCOUNT_SIZE }],
  });

  const activeMints: ActiveMint[] = [];
  for (const { account } of accounts) {
    const data = account.data;
    try {
      const listingType = data[OFFSET_LISTING_TYPE];
      const status = data[OFFSET_STATUS];
      if (listingType !== 0 || status !== 0) continue;

      const seller = new PublicKey(data.slice(OFFSET_SELLER, OFFSET_SELLER + 32)).toBase58();
      const nftMint = new PublicKey(data.slice(OFFSET_NFT_MINT, OFFSET_NFT_MINT + 32)).toBase58();
      const price = data.readBigUInt64LE(OFFSET_PRICE);
      activeMints.push({ isCore: false, nftMint, price, seller });
    } catch {
      // Skip unparseable accounts.
    }
  }

  // Also include Core listings (USDC fixed-price).
  const coreAccounts = await connection.getProgramAccounts(AUCTION_PROGRAM_ID, {
    filters: [
      { dataSize: CORE_LISTING_SIZE },
      { memcmp: { offset: 0, bytes: bs58Encode(CORE_LISTING_DISCRIMINATOR) } },
    ],
  });
  for (const { account } of coreAccounts) {
    const data = account.data;
    try {
      const seller = new PublicKey(data.slice(CORE_OFFSET_SELLER, CORE_OFFSET_SELLER + 32)).toBase58();
      const nftMint = new PublicKey(data.slice(CORE_OFFSET_ASSET, CORE_OFFSET_ASSET + 32)).toBase58();
      const collection = new PublicKey(data.slice(CORE_OFFSET_COLLECTION, CORE_OFFSET_COLLECTION + 32)).toBase58();
      const price = data.readBigUInt64LE(CORE_OFFSET_PRICE);
      activeMints.push({ isCore: true, nftMint, price, seller, collection });
    } catch {
      // Skip unparseable accounts.
    }
  }

  return activeMints;
}

async function fetchActiveArtifacteMintsFromAnyRpc(rpcUrls: readonly string[]): Promise<ActiveMint[]> {
  let lastError: unknown = null;

  for (const rpcUrl of rpcUrls) {
    try {
      const connection = new Connection(rpcUrl, "confirmed");
      return await fetchActiveArtifacteMints(connection);
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError ?? new Error("Failed to fetch active Artifacte listings from RPC upstreams");
}

async function fetchAssetMapFromAnyRpc(heliusRpcUrls: readonly string[], mintAddresses: string[]): Promise<Map<string, HeliusAsset>> {
  let lastError: unknown = null;

  for (const heliusRpc of heliusRpcUrls) {
    try {
      return await fetchAssetMap(heliusRpc, mintAddresses);
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError ?? new Error("Failed to fetch Artifacte asset metadata from DAS upstreams");
}

function buildArtifacteListings(activeMints: readonly ActiveMint[], assetMap: ReadonlyMap<string, HeliusAsset>): ArtifacteProgramListing[] {
  const listings: ArtifacteProgramListing[] = [];

  for (const activeMint of activeMints) {
    const asset = assetMap.get(activeMint.nftMint);
    if (!asset) continue;

    const listing = buildListingFromAsset(activeMint, asset);
    if (listing) listings.push(listing);
  }

  return listings;
}

function mergeFallbackArtifacteListingsWithActiveMints(
  activeMints: readonly ActiveMint[],
  fallbackListings: readonly ArtifacteProgramListing[],
): ArtifacteProgramListing[] {
  const fallbackByMint = new Map<string, ArtifacteProgramListing>();

  for (const listing of fallbackListings) {
    const mint = listing.nftAddress || listing.id;
    if (mint) {
      fallbackByMint.set(mint, listing);
    }
  }

  return activeMints.flatMap((activeMint) => {
    const fallbackListing = fallbackByMint.get(activeMint.nftMint);
    if (!fallbackListing) {
      return [];
    }

    const usdcPrice = Number(activeMint.price) / 1e6;
    return [{
      ...fallbackListing,
      isCore: activeMint.isCore,
      owner: fallbackListing.owner,
      price: usdcPrice,
      seller: activeMint.seller,
      usdcPrice,
    }];
  });
}

async function fetchActiveArtifacteListingsFromChain(
  solanaRpcUrls: readonly string[],
  heliusRpcUrls: readonly string[],
): Promise<ArtifacteProgramListing[]> {
  const activeMints = await fetchActiveArtifacteMintsFromAnyRpc(solanaRpcUrls);

  if (activeMints.length === 0) {
    return [];
  }

  const assetMap = await fetchAssetMapFromAnyRpc(
    heliusRpcUrls,
    activeMints.map((listing) => listing.nftMint)
  );

  return buildArtifacteListings(activeMints, assetMap);
}

async function fetchFallbackArtifacteListings(): Promise<ArtifacteProgramListing[] | null> {
  const fallbackUrl = getArtifacteListingsFallbackUrl();
  if (!fallbackUrl) {
    return null;
  }

  const response = await fetch(fallbackUrl, {
    cache: "no-store",
    signal: withTimeout(),
  });

  if (!response.ok) {
    throw new Error(`Fallback Artifacte listings returned ${response.status}`);
  }

  const payload = (await response.json()) as { listings?: ArtifacteProgramListing[] };
  return Array.isArray(payload.listings) ? payload.listings : [];
}

export async function loadActiveArtifacteFixedPriceListings(): Promise<ArtifacteProgramListing[]> {
  if (listingsCache && Date.now() - listingsCache.ts < ARTIFACTE_LISTINGS_CACHE_TTL) {
    return listingsCache.listings;
  }

  let activeMints: ActiveMint[] = [];

  try {
    activeMints = await fetchActiveArtifacteMintsFromAnyRpc(getSolanaRpcUpstreamUrls());

    const listings = activeMints.length === 0
      ? []
      : buildArtifacteListings(
          activeMints,
          await fetchAssetMapFromAnyRpc(
            getHeliusDasUpstreamUrls(),
            activeMints.map((listing) => listing.nftMint),
          ),
        );

    listingsCache = { ts: Date.now(), listings };
    return listings;
  } catch (error) {
    if (listingsCache) {
      return listingsCache.listings;
    }

    const fallbackListings = await fetchFallbackArtifacteListings().catch(() => null);
    if (fallbackListings) {
      const mergedListings = activeMints.length > 0
        ? mergeFallbackArtifacteListingsWithActiveMints(activeMints, fallbackListings)
        : fallbackListings;
      listingsCache = { ts: Date.now(), listings: mergedListings };
      return mergedListings;
    }

    throw error;
  }
}

export async function getActiveArtifacteMintSet(): Promise<Set<string>> {
  const listings = await loadActiveArtifacteFixedPriceListings();
  return new Set(listings.map((listing) => listing.nftAddress));
}