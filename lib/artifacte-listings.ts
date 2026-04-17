import { Connection, PublicKey } from "@solana/web3.js";
import * as anchor from "@coral-xyz/anchor";

const bs58Encode = (data: Buffer | Uint8Array): string =>
  anchor.utils.bytes.bs58.encode(data instanceof Buffer ? data : Buffer.from(data));

const AUCTION_PROGRAM_ID = new PublicKey("81s1tEx4MPdVvqS6X84Mok5K4N5fMbRLzcsT5eo2K8J3");
const ARTIFACTE_AUTHORITY = "DDSpvAK8DbuAdEaaBHkfLieLPSJVCWWgquFAA3pvxXoX";
const LISTING_ACCOUNT_SIZE = 240;
const OFFSET_NFT_MINT = 40;
const OFFSET_PRICE = 104;
const OFFSET_LISTING_TYPE = 112;
const OFFSET_STATUS = 130;
const ARTIFACTE_LISTINGS_CACHE_TTL = 30_000;
const DAS_BATCH_SIZE = 100;

// Core listing layout (153 bytes total):
//   8 (discriminator) + 32 seller + 32 asset + 32 collection + 32 payment_mint
//   + 8 price + 8 created_at + 1 bump
const CORE_LISTING_DISCRIMINATOR = Buffer.from([205, 178, 162, 169, 199, 166, 133, 157]);
const CORE_LISTING_SIZE = 153;
const CORE_OFFSET_SELLER = 8;
const CORE_OFFSET_ASSET = 8 + 32;
const CORE_OFFSET_PRICE = 8 + 32 + 32 + 32 + 32;

type ActiveMint = { nftMint: string; price: bigint };

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
  currency: "USDC";
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

function buildListingFromAsset(activeMint: ActiveMint, asset: HeliusAsset): ArtifacteProgramListing | null {
  const authorities = Array.isArray(asset.authorities) ? asset.authorities : [];
  if (!authorities.some((authority) => authority.address === ARTIFACTE_AUTHORITY)) {
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
    nftAddress: activeMint.nftMint,
    name,
    subtitle,
    image,
    price: usdcPrice,
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

      const nftMint = new PublicKey(data.slice(OFFSET_NFT_MINT, OFFSET_NFT_MINT + 32)).toBase58();
      const price = data.readBigUInt64LE(OFFSET_PRICE);
      activeMints.push({ nftMint, price });
    } catch {
      // Skip unparseable accounts.
    }
  }

  // Also include Core listings (USDC fixed-price; seller-filtered to owner).
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
      if (seller !== ARTIFACTE_AUTHORITY) continue;
      const nftMint = new PublicKey(data.slice(CORE_OFFSET_ASSET, CORE_OFFSET_ASSET + 32)).toBase58();
      const price = data.readBigUInt64LE(CORE_OFFSET_PRICE);
      activeMints.push({ nftMint, price });
    } catch {
      // Skip unparseable accounts.
    }
  }

  if (activeMints.length === 0) {
    return [];
  }

  const assetMap = await fetchAssetMap(
    heliusRpc,
    activeMints.map((listing) => listing.nftMint)
  );

  const listings: ArtifacteProgramListing[] = [];
  for (const activeMint of activeMints) {
    const asset = assetMap.get(activeMint.nftMint);
    if (!asset) continue;

    const listing = buildListingFromAsset(activeMint, asset);
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