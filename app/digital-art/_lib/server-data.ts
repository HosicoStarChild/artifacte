import "server-only";

import { address } from "@solana/kit";
import { PublicKey } from "@solana/web3.js";
import { cache } from "react";

import {
  buildNftLookupResponse,
  ensureHeliusRpcUrl,
  fetchHeliusRpc,
  getSolanaRpcUpstreamUrls,
  type HeliusAssetResponse,
} from "@/app/api/_lib/list-route-utils";
import {
  getCuratedMarketplaceListing,
  getCuratedMarketplaceListings,
  type ExternalMarketplaceListing,
  type MarketplaceListingsState,
  type MarketplaceSourceCounts,
  type MarketplaceSource,
  readCuratedCollections,
} from "@/app/lib/digital-art-marketplaces";
import {
  getAllowlistIdentifier,
  matchesAllowlistIdentifier,
  type AllowlistEntry,
  type CollectionLinks,
} from "@/lib/allowlist";
import { isArtifacteExternalFeeExempt } from "@/lib/external-purchase-fees";
import { resolveHomeImageSrc } from "@/lib/home-image";

const AUCTION_PROGRAM_ID = "81s1tEx4MPdVvqS6X84Mok5K4N5fMbRLzcsT5eo2K8J3";
const AUCTION_PROGRAM_ADDRESS = address(AUCTION_PROGRAM_ID);
const AUCTION_PROGRAM_PUBLIC_KEY = new PublicKey(AUCTION_PROGRAM_ID);
const LISTING_ACCOUNT_SIZE = 240;
const OWNER_ASSETS_PAGE_SIZE = 1000;
const FALLBACK_IMAGE = "/placeholder.png";
const SOLANA_RPC_TIMEOUT_MS = 5_000;
const TENSOR_TXS_GRAPHQL = "https://graphql-txs.tensor.trade/graphql";
const TENSOR_SALE_HISTORY_TIMEOUT_MS = 3_000;
const SALE_HISTORY_LIMIT = 12;
const TENSOR_SALE_TX_TYPES = ["SALE_BUY_NOW", "SALE_ACCEPT_BID"] as const;

const OFFSET_LISTING_SELLER = 8;
const OFFSET_LISTING_NFT_MINT = 40;
const OFFSET_LISTING_PAYMENT_MINT = 72;
const OFFSET_LISTING_PRICE = 104;
const OFFSET_LISTING_TYPE = 112;
const OFFSET_LISTING_START_TIME = 114;
const OFFSET_LISTING_END_TIME = 122;
const OFFSET_LISTING_STATUS = 130;
const OFFSET_LISTING_ESCROW_NFT_ACCOUNT = 131;
const OFFSET_LISTING_CURRENT_BID = 163;
const OFFSET_LISTING_HIGHEST_BIDDER = 171;
const OFFSET_LISTING_IS_TOKEN_2022 = 204;
const OFFSET_LISTING_ROYALTY_BPS = 205;
const OFFSET_LISTING_CREATOR_ADDRESS = 207;

const SUPPORTED_HELIUS_NFT_INTERFACES = new Set([
  "V1_NFT",
  "ProgrammableNFT",
  "V2_NFT",
]);

type HeliusBatchAsset = NonNullable<HeliusAssetResponse["result"]> & {
  burnt?: boolean;
  id?: string;
  interface?: string;
};

interface HeliusAssetBatchResponse {
  result?: HeliusBatchAsset[];
}

interface HeliusAssetsByOwnerResponse {
  error?: {
    message?: string;
  };
  result?: {
    items?: HeliusBatchAsset[];
  };
}

interface RpcProgramAccount {
  account: {
    data: [string, string];
  };
  pubkey: string;
}

interface RpcProgramAccountsResponse {
  error?: {
    message?: string;
  };
  result?: RpcProgramAccount[];
}

interface RpcAccountInfoResponse {
  error?: {
    message?: string;
  };
  result?: {
    value?: {
      data: [string, string];
    } | null;
  };
}

interface TensorSaleHistoryTx {
  buyerId?: string | null;
  grossAmount?: string | number | null;
  grossAmountUnit?: string | number | null;
  grossAmountUnitInfo?: {
    decimals?: number | null;
    symbol?: string | null;
  } | null;
  sellerId?: string | null;
  source?: string | null;
  txAt?: number | null;
  txId?: string | null;
  txKey?: string | null;
  txType?: string | null;
}

interface TensorSaleHistoryResponse {
  data?: {
    mintTransactions?: {
      txs?: Array<{
        tx?: TensorSaleHistoryTx | null;
      }> | null;
    } | null;
  };
  errors?: Array<{ message?: string }>;
}

type DigitalArtListingType = "fixed" | "auction";
type DigitalArtListingStatus = "active" | "settled" | "cancelled";

interface ParsedNativeListingAccount {
  creatorAddress: string;
  currentBidLamports: number | null;
  endTime: number | null;
  escrowNftAccount: string;
  highestBidder: string | null;
  isToken2022: boolean;
  listingPda: string;
  listingType: DigitalArtListingType;
  nftMint: string;
  paymentMint: string;
  priceLamports: number;
  royaltyBasisPoints: number;
  seller: string;
  startTime: number | null;
  status: DigitalArtListingStatus;
}

export interface DigitalArtCollectionDetails {
  collectionAddress: string;
  description: string | null;
  hasMagicEden: boolean;
  hasMarketplaceConfig: boolean;
  hasTensor: boolean;
  imageSrc: string;
  isFeeExempt: boolean;
  links: CollectionLinks | null;
  name: string;
  supply: number | null;
  targetAddresses: string[];
}

export interface DigitalArtNativeListingSummary {
  collectionName: string;
  currentBidLamports: number | null;
  endTime: number | null;
  highestBidder: string | null;
  imageSrc: string;
  isToken2022: boolean;
  listingPda: string;
  listingType: DigitalArtListingType;
  name: string;
  nftMint: string;
  paymentMint: string;
  priceLamports: number;
  royaltyBasisPoints: number;
  seller: string;
}

export interface DigitalArtNativeListingDetail extends DigitalArtNativeListingSummary {
  creatorAddress: string;
  escrowNftAccount: string;
  startTime: number | null;
  status: DigitalArtListingStatus;
}

export interface DigitalArtOwnedNft {
  collection: string;
  imageSrc: string;
  mint: string;
  name: string;
}

export interface DigitalArtSaleHistoryItem {
  buyer: string | null;
  currency: string;
  marketplace: string | null;
  price: number | null;
  seller: string | null;
  signature: string;
  timestamp: number | null;
}

export interface DigitalArtCollectionPageData {
  collection: DigitalArtCollectionDetails | null;
  marketplaceHasMore: boolean;
  marketplaceListings: ExternalMarketplaceListing[];
  marketplaceNextCursor: string | null;
  marketplaceSourceCounts: MarketplaceSourceCounts | null;
  marketplaceState: MarketplaceListingsState | null;
  nativeListings: DigitalArtNativeListingSummary[];
}

function getResolvedImageSrc(source: string | undefined): string {
  return resolveHomeImageSrc(source) ?? FALLBACK_IMAGE;
}

function formatMarketplaceLabel(value?: string | null): string | null {
  if (!value) {
    return null;
  }

  const normalized = value.toUpperCase();
  if (normalized.includes("MAGICEDEN")) return "Magic Eden";
  if (normalized.includes("TCOMP") || normalized.includes("TENSOR")) return "Tensor";
  if (normalized.includes("HADESWAP")) return "Hadeswap";

  return value
    .toLowerCase()
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function parseNumericAmount(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined) {
    return null;
  }

  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function parseTensorSalePrice(tx: TensorSaleHistoryTx): { currency: string; price: number | null } {
  const unitAmount = parseNumericAmount(tx.grossAmountUnit);
  const unitSymbol = tx.grossAmountUnitInfo?.symbol?.trim();
  if (unitAmount !== null && unitSymbol) {
    return { currency: unitSymbol, price: unitAmount };
  }

  const rawAmount = parseNumericAmount(tx.grossAmount);
  return { currency: "SOL", price: rawAmount === null ? null : rawAmount / 1_000_000_000 };
}

function parseTensorSaleHistoryItem(tx: TensorSaleHistoryTx | null | undefined): DigitalArtSaleHistoryItem | null {
  const signature = tx?.txId ?? tx?.txKey?.split(":")[0] ?? null;

  if (!tx || !signature) {
    return null;
  }

  const { currency, price } = parseTensorSalePrice(tx);

  const txAt = parseNumericAmount(tx.txAt);

  return {
    buyer: tx.buyerId ?? null,
    currency: price === null ? "UNKNOWN" : currency,
    marketplace: formatMarketplaceLabel(tx.source),
    price,
    seller: tx.sellerId ?? null,
    signature,
    timestamp: txAt === null ? null : Math.floor(txAt / 1000),
  };
}

function normalizeAddressList(values: readonly string[]): string[] {
  return Array.from(new Set(values.map((value) => `${address(value)}`))).sort();
}

function chunkValues<TValue>(values: readonly TValue[], size: number): TValue[][] {
  const chunks: TValue[][] = [];

  for (let index = 0; index < values.length; index += size) {
    chunks.push(values.slice(index, index + size));
  }

  return chunks;
}

async function fetchSolanaRpcPayload<TPayload extends { error?: { message?: string } }>(
  body: object,
): Promise<TPayload> {
  let lastError: unknown = null;

  for (const rpcUrl of getSolanaRpcUpstreamUrls()) {
    try {
      const response = await fetch(rpcUrl, {
        body: JSON.stringify(body),
        cache: "no-store",
        headers: {
          "Content-Type": "application/json",
        },
        method: "POST",
        signal: AbortSignal.timeout(SOLANA_RPC_TIMEOUT_MS),
      });

      if (!response.ok) {
        lastError = new Error(`Solana RPC error: ${response.status}`);
        continue;
      }

      const payload = (await response.json()) as TPayload;
      if (payload.error?.message) {
        lastError = new Error(payload.error.message);
        continue;
      }

      return payload;
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError ?? new Error("Failed to fetch from configured Solana RPC upstreams");
}

async function fetchNativeListingProgramAccounts(): Promise<RpcProgramAccount[]> {
  const payload = await fetchSolanaRpcPayload<RpcProgramAccountsResponse>({
    id: "digital-art-program-accounts",
    jsonrpc: "2.0",
    method: "getProgramAccounts",
    params: [
      AUCTION_PROGRAM_ID,
      {
        encoding: "base64",
        filters: [{ dataSize: LISTING_ACCOUNT_SIZE }],
      },
    ],
  });

  return Array.isArray(payload.result) ? payload.result : [];
}

async function fetchAccountInfo(accountAddress: string): Promise<[string, string] | null> {
  const payload = await fetchSolanaRpcPayload<RpcAccountInfoResponse>({
    id: "digital-art-account-info",
    jsonrpc: "2.0",
    method: "getAccountInfo",
    params: [
      accountAddress,
      {
        encoding: "base64",
      },
    ],
  });

  return payload.result?.value?.data ?? null;
}

function decodeAccountData(data: readonly [string, string]): Buffer {
  return Buffer.from(data[0], "base64");
}

function parseListingType(value: number): DigitalArtListingType | null {
  if (value === 0) {
    return "fixed";
  }

  if (value === 1) {
    return "auction";
  }

  return null;
}

function parseListingStatus(value: number): DigitalArtListingStatus | null {
  if (value === 0) {
    return "active";
  }

  if (value === 1) {
    return "settled";
  }

  if (value === 2) {
    return "cancelled";
  }

  return null;
}

function normalizeOptionalTimestamp(value: number): number | null {
  return value > 0 ? value : null;
}

function normalizeOptionalLamports(value: number): number | null {
  return value > 0 ? value : null;
}

function normalizeOptionalAddress(value: string, fallbackLamports: number | null): string | null {
  if (!fallbackLamports || value === PublicKey.default.toBase58()) {
    return null;
  }

  return value;
}

function parseNativeListingAccount(
  listingPda: string,
  data: Buffer
): ParsedNativeListingAccount | null {
  try {
    const listingType = parseListingType(data[OFFSET_LISTING_TYPE]);
    const status = parseListingStatus(data[OFFSET_LISTING_STATUS]);

    if (!listingType || !status) {
      return null;
    }

    const currentBidLamports = normalizeOptionalLamports(
      Number(data.readBigUInt64LE(OFFSET_LISTING_CURRENT_BID))
    );
    const highestBidderValue = new PublicKey(
      data.subarray(OFFSET_LISTING_HIGHEST_BIDDER, OFFSET_LISTING_HIGHEST_BIDDER + 32)
    ).toBase58();

    return {
      creatorAddress: new PublicKey(
        data.subarray(OFFSET_LISTING_CREATOR_ADDRESS, OFFSET_LISTING_CREATOR_ADDRESS + 32)
      ).toBase58(),
      currentBidLamports,
      endTime: normalizeOptionalTimestamp(
        Number(data.readBigInt64LE(OFFSET_LISTING_END_TIME))
      ),
      escrowNftAccount: new PublicKey(
        data.subarray(OFFSET_LISTING_ESCROW_NFT_ACCOUNT, OFFSET_LISTING_ESCROW_NFT_ACCOUNT + 32)
      ).toBase58(),
      highestBidder: normalizeOptionalAddress(highestBidderValue, currentBidLamports),
      isToken2022: data[OFFSET_LISTING_IS_TOKEN_2022] === 1,
      listingPda,
      listingType,
      nftMint: new PublicKey(
        data.subarray(OFFSET_LISTING_NFT_MINT, OFFSET_LISTING_NFT_MINT + 32)
      ).toBase58(),
      paymentMint: new PublicKey(
        data.subarray(OFFSET_LISTING_PAYMENT_MINT, OFFSET_LISTING_PAYMENT_MINT + 32)
      ).toBase58(),
      priceLamports: Number(data.readBigUInt64LE(OFFSET_LISTING_PRICE)),
      royaltyBasisPoints: data.readUInt16LE(OFFSET_LISTING_ROYALTY_BPS),
      seller: new PublicKey(
        data.subarray(OFFSET_LISTING_SELLER, OFFSET_LISTING_SELLER + 32)
      ).toBase58(),
      startTime: normalizeOptionalTimestamp(
        Number(data.readBigInt64LE(OFFSET_LISTING_START_TIME))
      ),
      status,
    };
  } catch {
    return null;
  }
}

function assetMatchesCollection(
  asset: HeliusBatchAsset | undefined,
  collectionAddresses: ReadonlySet<string>
): boolean {
  if (!asset) {
    return false;
  }

  for (const group of asset.grouping ?? []) {
    if (
      group.group_key === "collection" &&
      group.group_value &&
      collectionAddresses.has(group.group_value)
    ) {
      return true;
    }
  }

  return (asset.authorities ?? []).some(
    (authority) => authority.address && collectionAddresses.has(authority.address)
  );
}

function mapCollectionDetails(entry: AllowlistEntry, targetAddresses: string[]): DigitalArtCollectionDetails {
  const identifier = getAllowlistIdentifier(entry) ?? targetAddresses[0] ?? "";

  return {
    collectionAddress: identifier,
    description: entry.description ?? null,
    hasMagicEden: Boolean(entry.marketplaces?.magicEden?.symbol),
    hasMarketplaceConfig: Boolean(
      entry.marketplaces?.magicEden?.symbol ||
        entry.marketplaces?.tensor?.slug ||
        entry.collectionAddress ||
        entry.mintAuthority
    ),
    hasTensor: Boolean(
      entry.marketplaces?.tensor?.slug || entry.collectionAddress || entry.mintAuthority
    ),
    imageSrc: getResolvedImageSrc(entry.image),
    isFeeExempt: isArtifacteExternalFeeExempt({
      collectionAddress: identifier,
      collectionName: entry.name,
    }),
    links: entry.links ?? null,
    name: entry.name,
    supply: typeof entry.supply === "number" ? entry.supply : null,
    targetAddresses,
  };
}

function mapNativeListing(
  listing: ParsedNativeListingAccount,
  asset: HeliusBatchAsset | undefined
): DigitalArtNativeListingDetail {
  const nft = buildNftLookupResponse(asset, listing.nftMint).nft;

  return {
    collectionName: nft.collection,
    creatorAddress: listing.creatorAddress,
    currentBidLamports: listing.currentBidLamports,
    endTime: listing.endTime,
    escrowNftAccount: listing.escrowNftAccount,
    highestBidder: listing.highestBidder,
    imageSrc: getResolvedImageSrc(nft.image),
    isToken2022: listing.isToken2022,
    listingPda: listing.listingPda,
    listingType: listing.listingType,
    name: nft.name,
    nftMint: listing.nftMint,
    paymentMint: listing.paymentMint,
    priceLamports: listing.priceLamports,
    royaltyBasisPoints: listing.royaltyBasisPoints,
    seller: listing.seller,
    startTime: listing.startTime,
    status: listing.status,
  };
}

function toNativeListingSummary(
  listing: DigitalArtNativeListingDetail
): DigitalArtNativeListingSummary {
  return {
    collectionName: listing.collectionName,
    currentBidLamports: listing.currentBidLamports,
    endTime: listing.endTime,
    highestBidder: listing.highestBidder,
    imageSrc: listing.imageSrc,
    isToken2022: listing.isToken2022,
    listingPda: listing.listingPda,
    listingType: listing.listingType,
    name: listing.name,
    nftMint: listing.nftMint,
    paymentMint: listing.paymentMint,
    priceLamports: listing.priceLamports,
    royaltyBasisPoints: listing.royaltyBasisPoints,
    seller: listing.seller,
  };
}

async function fetchAssetMapByMint(
  rpcUrl: string,
  mints: readonly string[]
): Promise<Map<string, HeliusBatchAsset>> {
  const uniqueMints = Array.from(new Set(mints.filter(Boolean)));
  const assetMap = new Map<string, HeliusBatchAsset>();

  if (!uniqueMints.length) {
    return assetMap;
  }

  const responses = await Promise.all(
    chunkValues(uniqueMints, 100).map((chunk, index) =>
      fetchHeliusRpc<HeliusAssetBatchResponse>(rpcUrl, {
        id: `digital-art-asset-batch-${index}`,
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

async function fetchAssetsByOwner(owner: string): Promise<HeliusBatchAsset[]> {
  const rpcUrl = ensureHeliusRpcUrl();
  const assets: HeliusBatchAsset[] = [];
  let page = 1;

  while (true) {
    const response = await fetchHeliusRpc<HeliusAssetsByOwnerResponse>(rpcUrl, {
      id: `digital-art-owner-${page}`,
      jsonrpc: "2.0",
      method: "getAssetsByOwner",
      params: {
        displayOptions: {
          showFungible: false,
        },
        limit: OWNER_ASSETS_PAGE_SIZE,
        ownerAddress: owner,
        page,
      },
    });

    if (response.error?.message) {
      throw new Error(response.error.message);
    }

    const items = response.result?.items ?? [];
    assets.push(...items);

    if (items.length < OWNER_ASSETS_PAGE_SIZE) {
      break;
    }

    page += 1;
  }

  return assets;
}

const getAllNativeListingAccounts = cache(async (): Promise<ParsedNativeListingAccount[]> => {
  const accounts = await fetchNativeListingProgramAccounts();

  return accounts
    .map((account) =>
      parseNativeListingAccount(account.pubkey, decodeAccountData(account.account.data))
    )
    .filter((listing): listing is ParsedNativeListingAccount => listing !== null);
});

export const getDigitalArtCollectionDetails = cache(
  async (collectionAddress: string): Promise<DigitalArtCollectionDetails | null> => {
    const normalizedAddress = `${address(collectionAddress)}`;
    const collections = await readCuratedCollections();
    const collection = collections.find((entry) => matchesAllowlistIdentifier(entry, normalizedAddress));

    if (!collection) {
      return null;
    }

    const targetAddresses = normalizeAddressList(
      collections
        .filter((entry) => entry.name === collection.name)
        .map((entry) => getAllowlistIdentifier(entry))
        .filter((value): value is string => Boolean(value))
    );

    return mapCollectionDetails(collection, targetAddresses.length ? targetAddresses : [normalizedAddress]);
  }
);

export async function getDigitalArtNativeListingsForCollections(
  collectionAddresses: readonly string[]
): Promise<DigitalArtNativeListingSummary[]> {
  const normalizedAddresses = normalizeAddressList(collectionAddresses);
  const collectionSet = new Set(normalizedAddresses);
  const activeListings = (await getAllNativeListingAccounts()).filter(
    (listing) => listing.status === "active"
  );

  if (!activeListings.length) {
    return [];
  }

  const rpcUrl = ensureHeliusRpcUrl();
  const assetMap = await fetchAssetMapByMint(
    rpcUrl,
    activeListings.map((listing) => listing.nftMint)
  );

  return activeListings
    .filter((listing) =>
      collectionSet.size === 0 || assetMatchesCollection(assetMap.get(listing.nftMint), collectionSet)
    )
    .map((listing) => toNativeListingSummary(mapNativeListing(listing, assetMap.get(listing.nftMint))));
}

export const getDigitalArtNativeListingDetail = cache(
  async (mint: string): Promise<DigitalArtNativeListingDetail | null> => {
    const normalizedMint = `${address(mint)}`;
    const listingPda = PublicKey.findProgramAddressSync(
      [Buffer.from("listing"), new PublicKey(normalizedMint).toBuffer()],
      AUCTION_PROGRAM_PUBLIC_KEY
    )[0];
    const rpcUrl = ensureHeliusRpcUrl();
    const accountData = await fetchAccountInfo(listingPda.toBase58());

    if (!accountData) {
      return null;
    }

    const parsed = parseNativeListingAccount(
      listingPda.toBase58(),
      decodeAccountData(accountData)
    );

    if (!parsed) {
      return null;
    }

    const assetMap = await fetchAssetMapByMint(rpcUrl, [normalizedMint]);
    return mapNativeListing(parsed, assetMap.get(normalizedMint));
  }
);

export const getDigitalArtSaleHistory = cache(
  async (mint: string): Promise<DigitalArtSaleHistoryItem[]> => {
    const normalizedMint = `${address(mint)}`;

    try {
      const response = await fetch(TENSOR_TXS_GRAPHQL, {
        body: JSON.stringify({
          operationName: "MintSaleTransactions",
          query: `query MintSaleTransactions($mint: String!, $saleTxTypes: [TransactionType!]!, $limit: Int) {
            mintTransactions(mint: $mint, filters: { txTypes: $saleTxTypes }, limit: $limit) {
              txs {
                tx {
                  source
                  txKey
                  txId
                  txType
                  grossAmount
                  grossAmountUnit
                  grossAmountUnitInfo {
                    decimals
                    symbol
                  }
                  sellerId
                  buyerId
                  txAt
                }
              }
            }
          }`,
          variables: {
            limit: SALE_HISTORY_LIMIT,
            mint: normalizedMint,
            saleTxTypes: TENSOR_SALE_TX_TYPES,
          },
        }),
        cache: "no-store",
        headers: {
          "Content-Type": "application/json",
          Origin: "https://www.tensor.trade",
          Referer: "https://www.tensor.trade/",
        },
        method: "POST",
        signal: AbortSignal.timeout(TENSOR_SALE_HISTORY_TIMEOUT_MS),
      });

      if (!response.ok) {
        throw new Error(`Tensor sale history request failed with status ${response.status}`);
      }

      const payload = (await response.json()) as TensorSaleHistoryResponse;
      if (payload.errors?.length) {
        throw new Error(payload.errors.map((error) => error.message).filter(Boolean).join("; "));
      }

      const txs = payload.data?.mintTransactions?.txs ?? [];
      return txs
        .map((item) => parseTensorSaleHistoryItem(item.tx))
        .filter((item): item is DigitalArtSaleHistoryItem => Boolean(item))
        .slice(0, SALE_HISTORY_LIMIT);
    } catch (error) {
      console.error("[digital-art/sale-history] Failed to load Tensor sale history", error);
      return [];
    }
  }
);

export async function getDigitalArtOwnedNfts(
  owner: string,
  collectionAddresses: readonly string[]
): Promise<DigitalArtOwnedNft[]> {
  const normalizedOwner = `${address(owner)}`;
  const normalizedCollections = normalizeAddressList(collectionAddresses);
  const collectionSet = new Set(normalizedCollections);
  const assets = await fetchAssetsByOwner(normalizedOwner);

  return assets
    .filter((asset) => !asset.burnt)
    .filter((asset) => SUPPORTED_HELIUS_NFT_INTERFACES.has(asset.interface ?? ""))
    .filter((asset) => collectionSet.size === 0 || assetMatchesCollection(asset, collectionSet))
    .map((asset) => {
      const mint = asset.id ?? "";
      const nft = buildNftLookupResponse(asset, mint).nft;

      return {
        collection: nft.collection,
        imageSrc: getResolvedImageSrc(nft.image),
        mint,
        name: nft.name,
      };
    })
    .sort((left, right) => left.name.localeCompare(right.name));
}

export const getDigitalArtCollectionPageData = cache(
  async (collectionAddress: string): Promise<DigitalArtCollectionPageData> => {
    const collection = await getDigitalArtCollectionDetails(collectionAddress);

    if (!collection) {
      return {
        collection: null,
        marketplaceHasMore: false,
        marketplaceListings: [],
        marketplaceNextCursor: null,
        marketplaceSourceCounts: null,
        marketplaceState: null,
        nativeListings: [],
      };
    }

    const [nativeListingsResult, marketplaceResult] = await Promise.allSettled([
      getDigitalArtNativeListingsForCollections(collection.targetAddresses),
      collection.hasMarketplaceConfig
        ? getCuratedMarketplaceListings({
            collectionAddress: collection.collectionAddress,
            limit: 32,
          })
        : Promise.resolve({
            hasMore: false,
            listings: [] as ExternalMarketplaceListing[],
            nextCursor: null,
            sourceCounts: undefined,
            state: {
              degraded: false,
              stale: false,
              unavailableSources: [],
              warning: null,
            },
          }),
    ]);

    if (nativeListingsResult.status === "rejected") {
      console.error("[digital-art/collection] Failed to load native listings", nativeListingsResult.reason);
    }

    if (marketplaceResult.status === "rejected") {
      console.error("[digital-art/collection] Failed to load marketplace listings", marketplaceResult.reason);
    }

    return {
      collection,
      marketplaceHasMore:
        marketplaceResult.status === "fulfilled" ? marketplaceResult.value.hasMore : false,
      marketplaceListings:
        marketplaceResult.status === "fulfilled" ? marketplaceResult.value.listings : [],
      marketplaceNextCursor:
        marketplaceResult.status === "fulfilled" ? marketplaceResult.value.nextCursor : null,
      marketplaceSourceCounts:
        marketplaceResult.status === "fulfilled"
          ? marketplaceResult.value.sourceCounts ?? null
          : null,
      marketplaceState:
        marketplaceResult.status === "fulfilled" && collection.hasMarketplaceConfig
          ? marketplaceResult.value.state
          : null,
      nativeListings:
        nativeListingsResult.status === "fulfilled" ? nativeListingsResult.value : [],
    };
  }
);

export async function getDigitalArtExternalListingDetail(input: {
  collectionAddress: string;
  mint: string;
  source: MarketplaceSource;
}): Promise<ExternalMarketplaceListing | null> {
  return getCuratedMarketplaceListing({
    collectionAddress: `${address(input.collectionAddress)}`,
    mint: `${address(input.mint)}`,
    source: input.source,
  });
}
