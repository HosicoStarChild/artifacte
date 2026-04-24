import "server-only";

import bundledAllowlist from "@/data/allowlist.json";
import { resolveHomeImageSrc } from "@/lib/home-image";
import type {
  MyListingCurrency,
  MyListingMode,
  MyListingRecord,
  MyListingsPageData,
  MyListingSource,
  MyListingStatus,
} from "@/lib/my-listings";
import type { AllowlistEntry } from "@/lib/allowlist";
import { address } from "@solana/kit";
import { PublicKey } from "@solana/web3.js";
import { readFile } from "fs/promises";
import path from "path";

const HELIUS_API_KEY = process.env.HELIUS_API_KEY;
const HELIUS_RPC = HELIUS_API_KEY
  ? `https://mainnet.helius-rpc.com/?api-key=${HELIUS_API_KEY}`
  : null;

const ALLOWLIST_FILE = path.join(process.cwd(), "data", "allowlist.json");
const ALLOWLIST_FALLBACK = bundledAllowlist.collections as AllowlistEntry[];

const AUCTION_PROGRAM_ID = "81s1tEx4MPdVvqS6X84Mok5K4N5fMbRLzcsT5eo2K8J3";
const TENSOR_MARKETPLACE_PROGRAM = "TCMPhJdwDryooaGtiocG1u3xcYbRpiJzb283XfCZsDp";

const LISTING_ACCOUNT_SIZE_LEGACY = 240;
const LISTING_ACCOUNT_SIZE_CURRENT = 241;
const CORE_LISTING_ACCOUNT_SIZE = 153;
const DAS_BATCH_SIZE = 100;
const REQUEST_TIMEOUT_MS = 12_000;

const LISTING_ACCOUNT_DISCRIMINATOR = [218, 32, 50, 73, 43, 134, 26, 58] as const;
const CORE_LISTING_ACCOUNT_DISCRIMINATOR = [205, 178, 162, 169, 199, 166, 133, 157] as const;
const TENSOR_LIST_STATE_DISCRIMINATOR_BASE58 = "ECt8xkbczt2";
const DEFAULT_PUBLIC_KEY = "11111111111111111111111111111111";
const SOL_MINT = "So11111111111111111111111111111111111111112";
const USD1_MINT = "USD1ttGY1N17NEEHLmELoaybftRBUSErhqYiQzvEmuB";

type RpcProgramAccountFilter =
  | { dataSize: number }
  | { memcmp: { offset: number; bytes: string } };

interface RpcProgramAccountInfo {
  data: [string, string];
  executable: boolean;
  lamports: number;
  owner: string;
  rentEpoch: number;
  space: number;
}

interface RpcProgramAccount {
  account: RpcProgramAccountInfo;
  pubkey: string;
}

interface RpcProgramAccountsResponse {
  error?: {
    message?: string;
  };
  result?: RpcProgramAccount[];
}

interface HeliusAssetFile {
  cdn_uri?: string;
  uri?: string;
}

interface HeliusAsset {
  id?: string;
  authorities?: Array<{ address?: string }>;
  compression?: {
    compressed?: boolean;
  };
  content?: {
    files?: HeliusAssetFile[];
    links?: {
      image?: string;
    };
    metadata?: {
      name?: string;
    };
  };
  grouping?: Array<{ group_key?: string; group_value?: string }>;
}

interface HeliusAssetBatchResponse {
  error?: {
    message?: string;
  };
  result?: HeliusAsset[];
}

interface ParsedListingAccount {
  currentBidRaw: bigint;
  endTimeSeconds: number;
  highestBidder: string;
  isPnft: boolean;
  isToken2022: boolean;
  listingAddress: string;
  mode: MyListingMode;
  nftMint: string;
  paymentMint: string;
  priceRaw: bigint;
  royaltyBasisPoints: number;
  seller: string;
  status: MyListingStatus;
}

interface ParsedCoreListingAccount {
  asset: string;
  collection: string;
  listingAddress: string;
  paymentMint: string;
  priceRaw: bigint;
  seller: string;
}

interface ParsedTensorListingAccount {
  listingAddress: string;
  nftMint: string;
  priceRaw: bigint;
  seller: string;
  currency: MyListingCurrency;
}

interface ListingAssetMetadata {
  collectionAddress?: string;
  image: string;
  isCompressed: boolean;
  name: string;
}

interface AllowlistFileData {
  collections: AllowlistEntry[];
}

const statusPriority: Record<MyListingStatus, number> = {
  active: 0,
  completed: 1,
  cancelled: 2,
};

const sourcePriority: Record<MyListingSource, number> = {
  "artifacte-core": 0,
  artifacte: 1,
  tensor: 2,
};

function ensureHeliusRpc(): string {
  if (!HELIUS_RPC) {
    throw new Error("HELIUS_API_KEY is not configured");
  }

  return HELIUS_RPC;
}

function withTimeout(): AbortSignal {
  return AbortSignal.timeout(REQUEST_TIMEOUT_MS);
}

function readPublicKey(data: Buffer, offset: number): string {
  return new PublicKey(data.subarray(offset, offset + 32)).toBase58();
}

function matchesDiscriminator(
  data: Buffer,
  discriminator: readonly number[],
): boolean {
  return discriminator.every((value, index) => data[index] === value);
}

function normalizeStatus(statusByte: number): MyListingStatus {
  if (statusByte === 1) {
    return "completed";
  }

  if (statusByte === 2) {
    return "cancelled";
  }

  return "active";
}

function normalizeMode(modeByte: number): MyListingMode {
  return modeByte === 1 ? "auction" : "fixed-price";
}

function normalizeCurrency(paymentMint: string): MyListingCurrency {
  if (paymentMint === SOL_MINT) {
    return "SOL";
  }

  if (paymentMint === USD1_MINT) {
    return "USD1";
  }

  return "USDC";
}

function toDisplayAmount(rawAmount: bigint, currency: MyListingCurrency): number {
  const decimals = currency === "SOL" ? 9 : 6;
  return Number(rawAmount) / 10 ** decimals;
}

function truncateMint(mintAddress: string): string {
  return `${mintAddress.slice(0, 8)}...`;
}

function normalizeImage(image: string | undefined): string {
  return resolveHomeImageSrc(image) ?? "/placeholder-card.svg";
}

function getAssetCollectionIdentifier(asset: HeliusAsset): string | undefined {
  const collectionAddress = asset.grouping?.find(
    (group) => group.group_key === "collection",
  )?.group_value;

  if (collectionAddress) {
    return collectionAddress;
  }

  return asset.authorities?.find((authority) => authority.address)?.address;
}

function getAssetMetadata(asset?: HeliusAsset): ListingAssetMetadata {
  if (!asset) {
    return {
      image: "/placeholder-card.svg",
      isCompressed: false,
      name: "Untitled",
    };
  }

  const image =
    asset.content?.files?.find((file) => file.cdn_uri)?.cdn_uri ||
    asset.content?.links?.image ||
    asset.content?.files?.[0]?.uri;

  return {
    collectionAddress: getAssetCollectionIdentifier(asset),
    image: normalizeImage(image),
    isCompressed: asset.compression?.compressed === true,
    name: asset.content?.metadata?.name?.trim() || "Untitled",
  };
}

function parseListingAccount(
  account: RpcProgramAccount,
): ParsedListingAccount | null {
  const encodedData = account.account.data;

  if (encodedData[1] !== "base64") {
    return null;
  }

  const data = Buffer.from(encodedData[0], "base64");
  const isLegacySize = data.length === LISTING_ACCOUNT_SIZE_LEGACY;
  const isCurrentSize = data.length === LISTING_ACCOUNT_SIZE_CURRENT;

  if ((!isLegacySize && !isCurrentSize) || !matchesDiscriminator(data, LISTING_ACCOUNT_DISCRIMINATOR)) {
    return null;
  }

  const hasPnftFlag = isCurrentSize;
  const royaltyOffset = hasPnftFlag ? 206 : 205;

  return {
    currentBidRaw: data.readBigUInt64LE(163),
    endTimeSeconds: Number(data.readBigInt64LE(122)),
    highestBidder: readPublicKey(data, 171),
    isPnft: hasPnftFlag ? data[205] === 1 : false,
    isToken2022: data[204] === 1,
    listingAddress: account.pubkey,
    mode: normalizeMode(data[112]),
    nftMint: readPublicKey(data, 40),
    paymentMint: readPublicKey(data, 72),
    priceRaw: data.readBigUInt64LE(104),
    royaltyBasisPoints: data.readUInt16LE(royaltyOffset),
    seller: readPublicKey(data, 8),
    status: normalizeStatus(data[130]),
  };
}

function parseCoreListingAccount(
  account: RpcProgramAccount,
): ParsedCoreListingAccount | null {
  const encodedData = account.account.data;

  if (encodedData[1] !== "base64") {
    return null;
  }

  const data = Buffer.from(encodedData[0], "base64");

  if (
    data.length !== CORE_LISTING_ACCOUNT_SIZE ||
    !matchesDiscriminator(data, CORE_LISTING_ACCOUNT_DISCRIMINATOR)
  ) {
    return null;
  }

  return {
    asset: readPublicKey(data, 40),
    collection: readPublicKey(data, 72),
    listingAddress: account.pubkey,
    paymentMint: readPublicKey(data, 104),
    priceRaw: data.readBigUInt64LE(136),
    seller: readPublicKey(data, 8),
  };
}

function parseTensorListingAccount(
  account: RpcProgramAccount,
): ParsedTensorListingAccount | null {
  const encodedData = account.account.data;

  if (encodedData[1] !== "base64") {
    return null;
  }

  const data = Buffer.from(encodedData[0], "base64");
  const nftMint = readPublicKey(data, 42);
  const hasCurrency = data[82] === 1;
  const paymentMint = hasCurrency ? readPublicKey(data, 83) : SOL_MINT;

  return {
    currency: normalizeCurrency(paymentMint),
    listingAddress: account.pubkey,
    nftMint,
    priceRaw: data.readBigUInt64LE(74),
    seller: readPublicKey(data, 10),
  };
}

async function fetchProgramAccounts(
  programId: string,
  filters: RpcProgramAccountFilter[],
): Promise<RpcProgramAccount[]> {
  const rpcUrl = ensureHeliusRpc();
  const response = await fetch(rpcUrl, {
    body: JSON.stringify({
      id: "my-listings-program-accounts",
      jsonrpc: "2.0",
      method: "getProgramAccounts",
      params: [
        programId,
        {
          encoding: "base64",
          filters,
        },
      ],
    }),
    cache: "no-store",
    headers: {
      "Content-Type": "application/json",
    },
    method: "POST",
    signal: withTimeout(),
  });

  if (!response.ok) {
    throw new Error(`Program account RPC failed with ${response.status}`);
  }

  const payload = (await response.json()) as RpcProgramAccountsResponse;

  if (payload.error?.message) {
    throw new Error(payload.error.message);
  }

  return Array.isArray(payload.result) ? payload.result : [];
}

async function fetchAssetMap(mintAddresses: string[]): Promise<Map<string, HeliusAsset>> {
  const rpcUrl = ensureHeliusRpc();
  const uniqueMints = Array.from(new Set(mintAddresses.filter(Boolean)));
  const assetMap = new Map<string, HeliusAsset>();

  for (let index = 0; index < uniqueMints.length; index += DAS_BATCH_SIZE) {
    const batch = uniqueMints.slice(index, index + DAS_BATCH_SIZE);
    const response = await fetch(rpcUrl, {
      body: JSON.stringify({
        id: `my-listings-asset-batch-${index / DAS_BATCH_SIZE}`,
        jsonrpc: "2.0",
        method: "getAssetBatch",
        params: { ids: batch },
      }),
      cache: "no-store",
      headers: {
        "Content-Type": "application/json",
      },
      method: "POST",
      signal: withTimeout(),
    });

    if (!response.ok) {
      throw new Error(`Helius DAS returned ${response.status}`);
    }

    const payload = (await response.json()) as HeliusAssetBatchResponse;

    if (payload.error?.message) {
      throw new Error(payload.error.message);
    }

    for (const asset of payload.result ?? []) {
      if (asset.id) {
        assetMap.set(asset.id, asset);
      }
    }
  }

  return assetMap;
}

async function readAllowlistEntries(): Promise<AllowlistEntry[]> {
  try {
    const content = await readFile(ALLOWLIST_FILE, "utf8");
    const parsed = JSON.parse(content) as AllowlistFileData;
    return Array.isArray(parsed.collections)
      ? parsed.collections
      : ALLOWLIST_FALLBACK;
  } catch {
    return ALLOWLIST_FALLBACK;
  }
}

function createAllowlistIdentifierSet(entries: AllowlistEntry[]): Set<string> {
  const identifiers = new Set<string>();

  for (const entry of entries) {
    if (entry.collectionAddress) {
      identifiers.add(entry.collectionAddress);
    }

    if (entry.mintAuthority) {
      identifiers.add(entry.mintAuthority);
    }
  }

  return identifiers;
}

function isAllowlistedCollection(
  collectionAddress: string | undefined,
  allowlistIdentifiers: Set<string>,
): boolean {
  return Boolean(collectionAddress && allowlistIdentifiers.has(collectionAddress));
}

function getListingHref(nftMint: string): string {
  return `/auctions/cards/${nftMint}`;
}

function sortListings(listings: MyListingRecord[]): MyListingRecord[] {
  return listings.toSorted((left, right) => {
    const statusDifference = statusPriority[left.status] - statusPriority[right.status];
    if (statusDifference !== 0) {
      return statusDifference;
    }

    const sourceDifference = sourcePriority[left.source] - sourcePriority[right.source];
    if (sourceDifference !== 0) {
      return sourceDifference;
    }

    if (left.endsAt && right.endsAt && left.endsAt !== right.endsAt) {
      return left.endsAt - right.endsAt;
    }

    return left.name.localeCompare(right.name);
  });
}

function toListingLabel(source: MyListingSource, mode: MyListingMode): string {
  if (source === "tensor") {
    return "Fixed Price (Tensor)";
  }

  if (mode === "auction") {
    return "Auction";
  }

  return "Fixed Price";
}

function toArtifacteListing(
  listing: ParsedListingAccount,
  assetMetadata: ListingAssetMetadata,
): MyListingRecord {
  const currency = normalizeCurrency(listing.paymentMint);
  const highestBidder =
    listing.highestBidder !== DEFAULT_PUBLIC_KEY ? listing.highestBidder : undefined;

  return {
    collectionAddress: assetMetadata.collectionAddress,
    currentBid:
      listing.currentBidRaw > BigInt(0)
        ? toDisplayAmount(listing.currentBidRaw, currency)
        : undefined,
    currency,
    endsAt:
      listing.mode === "auction" && listing.endTimeSeconds > 0
        ? listing.endTimeSeconds * 1000
        : undefined,
    highestBidder,
    href: getListingHref(listing.nftMint),
    id: listing.listingAddress,
    image: assetMetadata.image,
    isCore: false,
    isPnft: listing.isPnft,
    isToken2022: listing.isToken2022,
    listingTypeLabel: toListingLabel("artifacte", listing.mode),
    mode: listing.mode,
    name: assetMetadata.name || truncateMint(listing.nftMint),
    nftMint: listing.nftMint,
    price: toDisplayAmount(listing.priceRaw, currency),
    royaltyBasisPoints: listing.royaltyBasisPoints,
    source: "artifacte",
    status: listing.status,
  };
}

function toCoreListing(
  listing: ParsedCoreListingAccount,
  assetMetadata: ListingAssetMetadata,
): MyListingRecord {
  return {
    collectionAddress: assetMetadata.collectionAddress || listing.collection,
    currency: normalizeCurrency(listing.paymentMint),
    href: getListingHref(listing.asset),
    id: listing.listingAddress,
    image: assetMetadata.image,
    isCore: true,
    isPnft: false,
    isToken2022: false,
    listingTypeLabel: toListingLabel("artifacte-core", "fixed-price"),
    mode: "fixed-price",
    name: assetMetadata.name || truncateMint(listing.asset),
    nftMint: listing.asset,
    price: toDisplayAmount(listing.priceRaw, normalizeCurrency(listing.paymentMint)),
    royaltyBasisPoints: 0,
    source: "artifacte-core",
    status: "active",
  };
}

function toTensorListing(
  listing: ParsedTensorListingAccount,
  assetMetadata: ListingAssetMetadata,
): MyListingRecord {
  return {
    collectionAddress: assetMetadata.collectionAddress,
    currency: listing.currency,
    href: getListingHref(listing.nftMint),
    id: listing.listingAddress,
    image: assetMetadata.image,
    isCore: false,
    isPnft: false,
    isToken2022: false,
    listingTypeLabel: toListingLabel("tensor", "fixed-price"),
    mode: "fixed-price",
    name: assetMetadata.name || truncateMint(listing.nftMint),
    nftMint: listing.nftMint,
    price: toDisplayAmount(listing.priceRaw, listing.currency),
    royaltyBasisPoints: 0,
    source: "tensor",
    status: "active",
  };
}

async function fetchArtifacteListingsForWallet(
  walletAddress: string,
): Promise<ParsedListingAccount[]> {
  const accounts = await fetchProgramAccounts(AUCTION_PROGRAM_ID, [
    {
      memcmp: {
        bytes: walletAddress,
        offset: 8,
      },
    },
  ]);

  return accounts.flatMap((account) => {
    const parsed = parseListingAccount(account);
    return parsed ? [parsed] : [];
  });
}

async function fetchCoreListingsForWallet(
  walletAddress: string,
): Promise<ParsedCoreListingAccount[]> {
  const accounts = await fetchProgramAccounts(AUCTION_PROGRAM_ID, [
    {
      dataSize: CORE_LISTING_ACCOUNT_SIZE,
    },
    {
      memcmp: {
        bytes: walletAddress,
        offset: 8,
      },
    },
    {
      memcmp: {
        bytes: new PublicKey(Buffer.from(CORE_LISTING_ACCOUNT_DISCRIMINATOR)).toBase58(),
        offset: 0,
      },
    },
  ]);

  return accounts.flatMap((account) => {
    const parsed = parseCoreListingAccount(account);
    return parsed ? [parsed] : [];
  });
}

async function fetchTensorListingsForWallet(
  walletAddress: string,
): Promise<ParsedTensorListingAccount[]> {
  const accounts = await fetchProgramAccounts(TENSOR_MARKETPLACE_PROGRAM, [
    {
      memcmp: {
        bytes: TENSOR_LIST_STATE_DISCRIMINATOR_BASE58,
        offset: 0,
      },
    },
    {
      memcmp: {
        bytes: walletAddress,
        offset: 10,
      },
    },
  ]);

  return accounts.flatMap((account) => {
    const parsed = parseTensorListingAccount(account);
    return parsed ? [parsed] : [];
  });
}

export function validateMyListingsWallet(wallet: string): string {
  address(wallet);
  return wallet;
}

export async function getMyListingsPageData(
  wallet: string,
): Promise<MyListingsPageData> {
  const validatedWallet = validateMyListingsWallet(wallet);

  const [allowlistEntries, artifacteListings, coreListings, tensorListings] = await Promise.all([
    readAllowlistEntries(),
    fetchArtifacteListingsForWallet(validatedWallet),
    fetchCoreListingsForWallet(validatedWallet),
    fetchTensorListingsForWallet(validatedWallet),
  ]);

  const assetMap = await fetchAssetMap([
    ...artifacteListings.map((listing) => listing.nftMint),
    ...coreListings.map((listing) => listing.asset),
    ...tensorListings.map((listing) => listing.nftMint),
  ]);

  const allowlistIdentifiers = createAllowlistIdentifierSet(allowlistEntries);

  const normalizedCoreListings = coreListings.map((listing) =>
    toCoreListing(listing, getAssetMetadata(assetMap.get(listing.asset))),
  );

  const normalizedArtifacteListings = artifacteListings.map((listing) =>
    toArtifacteListing(listing, getAssetMetadata(assetMap.get(listing.nftMint))),
  );

  const normalizedTensorListings = tensorListings
    .map((listing) =>
      toTensorListing(listing, getAssetMetadata(assetMap.get(listing.nftMint))),
    )
    .filter((listing) =>
      isAllowlistedCollection(listing.collectionAddress, allowlistIdentifiers),
    );

  const mergedListings = new Map<string, MyListingRecord>();

  for (const listing of [
    ...normalizedCoreListings,
    ...normalizedArtifacteListings,
    ...normalizedTensorListings,
  ]) {
    if (!mergedListings.has(listing.nftMint)) {
      mergedListings.set(listing.nftMint, listing);
    }
  }

  return {
    listings: sortListings(Array.from(mergedListings.values())),
    ok: true,
    updatedAt: Date.now(),
    wallet: validatedWallet,
  };
}