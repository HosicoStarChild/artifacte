import { Connection, PublicKey } from "@solana/web3.js";

const AUCTION_PROGRAM_ID = new PublicKey("81s1tEx4MPdVvqS6X84Mok5K4N5fMbRLzcsT5eo2K8J3");
const ARTIFACTE_AUTHORITY = "DDSpvAK8DbuAdEaaBHkfLieLPSJVCWWgquFAA3pvxXoX";
const ARTIFACTE_CORE_COLLECTION = "jzkJTGAuDcWthM91S1ch7wPcfMUQB5CdYH6hA25K4CS";
const LISTING_ACCOUNT_SIZE = 240;
const CORE_LISTING_ACCOUNT_SIZE = 189;
const CORE_LISTING_ACCOUNT_DISCRIMINATOR = Buffer.from([205, 178, 162, 169, 199, 166, 133, 157]);
const OFFSET_NFT_MINT = 40;
const OFFSET_PAYMENT_MINT = 72;
const OFFSET_PRICE = 104;
const OFFSET_LISTING_TYPE = 112;
const OFFSET_STATUS = 130;
const CORE_OFFSET_ASSET_ID = 40;
const CORE_OFFSET_COLLECTION = 72;
const CORE_OFFSET_PAYMENT_MINT = 104;
const CORE_OFFSET_PRICE = 136;
const CORE_OFFSET_STATUS = 145;
const ARTIFACTE_LISTINGS_CACHE_TTL = 30_000;
const DAS_BATCH_SIZE = 100;

type ActiveListingAccount = {
  assetId: string;
  price: bigint;
  paymentMint: string;
  source: "legacy" | "core";
};

type HeliusAuthority = { address?: string };
type HeliusAttribute = { trait_type?: string; value?: string };
type HeliusFile = { cdn_uri?: string; uri?: string };
type HeliusAsset = {
  id?: string;
  authorities?: HeliusAuthority[];
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
  nftAddress: string;
  name: string;
  subtitle: string;
  image: string;
  price: number;
  usdcPrice: number;
  currency: "USDC" | "USD1" | "SOL";
  source: "artifacte";
  marketplace: "artifacte";
}

let listingsCache: { ts: number; listings: ArtifacteProgramListing[] } | null = null;

function getHeliusRpcUrl(): string | null {
  const apiKey = process.env.HELIUS_API_KEY;
  if (!apiKey) return null;
  return `https://mainnet.helius-rpc.com/?api-key=${apiKey}`;
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

  if (
    normalized.includes("arweave.net/") ||
    normalized.includes("nftstorage.link/") ||
    normalized.includes("/ipfs/") ||
    normalized.includes("irys.xyz/")
  ) {
    return `/api/img-proxy?url=${encodeURIComponent(normalized)}`;
  }

  return normalized;
}

function getListingCurrency(paymentMint: string): "USDC" | "USD1" | "SOL" {
  if (paymentMint === "So11111111111111111111111111111111111111112") return "SOL";
  if (paymentMint === "USD1ttGY1N17NEEHLmELoaybftRBUSErhqYiQzvEmuB") return "USD1";
  return "USDC";
}

function buildListingFromAsset(activeListing: ActiveListingAccount, asset: HeliusAsset): ArtifacteProgramListing | null {
  const authorities = Array.isArray(asset.authorities) ? asset.authorities : [];
  const isArtifacteAsset =
    activeListing.source === "core"
      ? true
      : authorities.some((authority) => authority.address === ARTIFACTE_AUTHORITY);
  if (!isArtifacteAsset) {
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
  const currency = getListingCurrency(activeListing.paymentMint);
  const divisor = currency === "SOL" ? 1e9 : 1e6;
  const numericPrice = Number(activeListing.price) / divisor;

  return {
    id: activeListing.assetId,
    nftAddress: activeListing.assetId,
    name,
    subtitle,
    image,
    price: numericPrice,
    usdcPrice: currency === "SOL" ? 0 : numericPrice,
    currency,
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

async function fetchActiveArtifacteListingsFromChain(heliusRpc: string): Promise<ArtifacteProgramListing[]> {
  const connection = new Connection(heliusRpc);
  const legacyAccounts = await connection.getProgramAccounts(AUCTION_PROGRAM_ID, {
    filters: [{ dataSize: LISTING_ACCOUNT_SIZE }],
  });
  const coreAccounts = await connection.getProgramAccounts(AUCTION_PROGRAM_ID, {
    filters: [{ dataSize: CORE_LISTING_ACCOUNT_SIZE }],
  });

  const activeListings: ActiveListingAccount[] = [];
  for (const { account } of legacyAccounts) {
    const data = account.data;
    try {
      const listingType = data[OFFSET_LISTING_TYPE];
      const status = data[OFFSET_STATUS];
      if (listingType !== 0 || status !== 0) continue;

      const nftMint = new PublicKey(data.slice(OFFSET_NFT_MINT, OFFSET_NFT_MINT + 32)).toBase58();
      const paymentMint = new PublicKey(data.slice(OFFSET_PAYMENT_MINT, OFFSET_PAYMENT_MINT + 32)).toBase58();
      const price = data.readBigUInt64LE(OFFSET_PRICE);
      activeListings.push({ assetId: nftMint, price, paymentMint, source: "legacy" });
    } catch {
      // Skip unparseable accounts.
    }
  }

  for (const { account } of coreAccounts) {
    const data = Buffer.from(account.data);
    try {
      if (!data.subarray(0, 8).equals(CORE_LISTING_ACCOUNT_DISCRIMINATOR)) continue;
      const status = data[CORE_OFFSET_STATUS];
      if (status !== 0) continue;

      const assetId = new PublicKey(data.slice(CORE_OFFSET_ASSET_ID, CORE_OFFSET_ASSET_ID + 32)).toBase58();
      const collection = new PublicKey(data.slice(CORE_OFFSET_COLLECTION, CORE_OFFSET_COLLECTION + 32)).toBase58();
      if (collection !== ARTIFACTE_CORE_COLLECTION) continue;

      const paymentMint = new PublicKey(data.slice(CORE_OFFSET_PAYMENT_MINT, CORE_OFFSET_PAYMENT_MINT + 32)).toBase58();
      const price = data.readBigUInt64LE(CORE_OFFSET_PRICE);
      activeListings.push({ assetId, price, paymentMint, source: "core" });
    } catch {
      // Skip unparseable accounts.
    }
  }

  if (activeListings.length === 0) {
    return [];
  }

  const assetMap = await fetchAssetMap(
    heliusRpc,
    activeListings.map((listing) => listing.assetId)
  );

  const listings: ArtifacteProgramListing[] = [];
  for (const activeListing of activeListings) {
    const asset = assetMap.get(activeListing.assetId);
    if (!asset) continue;

    const listing = buildListingFromAsset(activeListing, asset);
    if (listing) listings.push(listing);
  }

  return listings;
}

export async function loadActiveArtifacteFixedPriceListings(): Promise<ArtifacteProgramListing[]> {
  if (listingsCache && Date.now() - listingsCache.ts < ARTIFACTE_LISTINGS_CACHE_TTL) {
    return listingsCache.listings;
  }

  const heliusRpc = getHeliusRpcUrl();
  if (!heliusRpc) {
    return [];
  }

  const listings = await fetchActiveArtifacteListingsFromChain(heliusRpc);
  listingsCache = { ts: Date.now(), listings };
  return listings;
}

export async function getActiveArtifacteMintSet(): Promise<Set<string>> {
  const listings = await loadActiveArtifacteFixedPriceListings();
  return new Set(listings.map((listing) => listing.nftAddress));
}