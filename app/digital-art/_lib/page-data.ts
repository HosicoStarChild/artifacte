import "server-only";

import { address, createSolanaRpc } from "@solana/kit";
import { PublicKey } from "@solana/web3.js";
import { cache } from "react";

import {
  buildNftLookupResponse,
  ensureHeliusRpcUrl,
  fetchHeliusRpc,
  type HeliusAssetResponse,
} from "@/app/api/_lib/list-route-utils";
import { readCuratedCollections } from "@/app/lib/digital-art-marketplaces";
import { getAllowlistIdentifier, type AllowlistEntry } from "@/lib/allowlist";
import { resolveHomeImageSrc } from "@/lib/home-image";

const AUCTION_PROGRAM_ADDRESS = address("81s1tEx4MPdVvqS6X84Mok5K4N5fMbRLzcsT5eo2K8J3");
const LISTING_ACCOUNT_SIZE = 240;
const OFFSET_NFT_MINT = 40;
const OFFSET_PRICE = 104;
const OFFSET_LISTING_TYPE = 112;
const OFFSET_END_TIME = 122;
const OFFSET_STATUS = 130;
const OFFSET_CURRENT_BID = 163;
const ACTIVE_LISTING_STATUS = 0;
const HIDDEN_COLLECTIONS = new Set([
  "Collectors Crypt",
  "Collector Crypt",
  "Phygitals",
  "phygitals",
]);
const DAS_BATCH_SIZE = 100;
const FALLBACK_IMAGE = "/placeholder.png";

type ListingType = "auction" | "fixed";

type HeliusBatchAsset = NonNullable<HeliusAssetResponse["result"]> & {
  id?: string;
};

interface HeliusAssetBatchResponse {
  result?: HeliusBatchAsset[];
}

interface ParsedListingAccount {
  mint: string;
  priceLamports: number;
  listingType: ListingType;
  endTime: number | null;
  currentBidLamports: number | null;
}

export interface DigitalArtCollectionCardData {
  collectionAddress: string;
  href: string;
  imageSrc: string;
  name: string;
  supply: number | null;
}

export interface DigitalArtListingCardData {
  collectionName: string;
  currentBidLamports: number | null;
  endTime: number | null;
  href: string;
  imageSrc: string;
  listingType: ListingType;
  mint: string;
  name: string;
  priceLamports: number;
}

export type DigitalArtListingsStatus = "ready" | "unavailable";

function getResolvedImageSrc(source: string | undefined): string {
  return resolveHomeImageSrc(source) ?? FALLBACK_IMAGE;
}

function mapCollection(entry: AllowlistEntry): DigitalArtCollectionCardData | null {
  const identifier = getAllowlistIdentifier(entry);

  if (!identifier || HIDDEN_COLLECTIONS.has(entry.name)) {
    return null;
  }

  return {
    collectionAddress: identifier,
    href: `/digital-art/${identifier}`,
    imageSrc: getResolvedImageSrc(entry.image),
    name: entry.name,
    supply: typeof entry.supply === "number" ? entry.supply : null,
  };
}

async function loadCollections(): Promise<DigitalArtCollectionCardData[]> {
  const entries = await readCuratedCollections();
  const seenNames = new Set<string>();
  const collections: DigitalArtCollectionCardData[] = [];

  for (const entry of entries) {
    if (seenNames.has(entry.name)) {
      continue;
    }

    const collection = mapCollection(entry);
    if (!collection) {
      continue;
    }

    seenNames.add(entry.name);
    collections.push(collection);
  }

  return collections;
}

function decodeAccountData(data: readonly [string, string]): Buffer {
  return Buffer.from(data[0], "base64");
}

function parseListingType(value: number): ListingType | null {
  if (value === 0) {
    return "fixed";
  }

  if (value === 1) {
    return "auction";
  }

  return null;
}

function parseActiveListingAccount(data: Buffer): ParsedListingAccount | null {
  try {
    const status = data[OFFSET_STATUS];
    if (status !== ACTIVE_LISTING_STATUS) {
      return null;
    }

    const listingType = parseListingType(data[OFFSET_LISTING_TYPE]);
    if (!listingType) {
      return null;
    }

    const mint = new PublicKey(data.subarray(OFFSET_NFT_MINT, OFFSET_NFT_MINT + 32)).toBase58();
    const priceLamports = Number(data.readBigUInt64LE(OFFSET_PRICE));
    const endTimeValue = Number(data.readBigInt64LE(OFFSET_END_TIME));
    const currentBidLamports = Number(data.readBigUInt64LE(OFFSET_CURRENT_BID));

    return {
      currentBidLamports: currentBidLamports > 0 ? currentBidLamports : null,
      endTime: endTimeValue > 0 ? endTimeValue : null,
      listingType,
      mint,
      priceLamports,
    };
  } catch {
    return null;
  }
}

function chunkValues<TValue>(values: readonly TValue[], size: number): TValue[][] {
  const chunks: TValue[][] = [];

  for (let index = 0; index < values.length; index += size) {
    chunks.push(values.slice(index, index + size));
  }

  return chunks;
}

async function fetchAssetMap(rpcUrl: string, mints: readonly string[]): Promise<Map<string, HeliusBatchAsset>> {
  const uniqueMints = Array.from(new Set(mints));
  const assetMap = new Map<string, HeliusBatchAsset>();

  if (!uniqueMints.length) {
    return assetMap;
  }

  const responses = await Promise.all(
    chunkValues(uniqueMints, DAS_BATCH_SIZE).map((chunk, index) =>
      fetchHeliusRpc<HeliusAssetBatchResponse>(rpcUrl, {
        id: `digital-art-home-${index}`,
        jsonrpc: "2.0",
        method: "getAssetBatch",
        params: { ids: chunk },
      })
    )
  );

  for (const response of responses) {
    for (const asset of response.result ?? []) {
      if (asset.id) {
        assetMap.set(asset.id, asset);
      }
    }
  }

  return assetMap;
}

async function loadActiveListings(): Promise<DigitalArtListingCardData[]> {
  const rpcUrl = ensureHeliusRpcUrl();
  const rpc = createSolanaRpc(rpcUrl);
  const accounts = await rpc
    .getProgramAccounts(AUCTION_PROGRAM_ADDRESS, {
      encoding: "base64",
      filters: [{ dataSize: BigInt(LISTING_ACCOUNT_SIZE) }],
    })
    .send();

  const parsedListings = accounts
    .map((account) => parseActiveListingAccount(decodeAccountData(account.account.data)))
    .filter((listing): listing is ParsedListingAccount => listing !== null);

  if (!parsedListings.length) {
    return [];
  }

  const assetMap = await fetchAssetMap(
    rpcUrl,
    parsedListings.map((listing) => listing.mint)
  );

  return parsedListings.map((listing) => {
    const asset = assetMap.get(listing.mint);
    const nft = buildNftLookupResponse(asset, listing.mint).nft;

    return {
      collectionName: nft.collection,
      currentBidLamports: listing.currentBidLamports,
      endTime: listing.endTime,
      href: `/digital-art/auction/${listing.mint}`,
      imageSrc: getResolvedImageSrc(nft.image),
      listingType: listing.listingType,
      mint: listing.mint,
      name: nft.name,
      priceLamports: listing.priceLamports,
    };
  });
}

export const getDigitalArtCollections = cache(loadCollections);

export const getDigitalArtActiveListings = cache(loadActiveListings);