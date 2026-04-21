import {
  Connection,
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionInstruction,
  TransactionMessage,
  VersionedTransaction,
  type AddressLookupTableAccount,
  type MessageAddressTableLookup,
} from '@solana/web3.js';
import {
  createAssociatedTokenAccountInstruction,
  createTransferInstruction,
  getAssociatedTokenAddress,
} from '@solana/spl-token';

import {
  calculateExternalMarketplaceFeeAmount,
  shouldApplyExternalMarketplaceFee,
  EXTERNAL_MARKETPLACE_FEE_WALLET,
  type ArtifacteAssetLike,
} from '@/lib/external-purchase-fees';
import {
  MAGIC_EDEN_M2_PROGRAM,
  MAGIC_EDEN_M3_PROGRAM,
  type JsonObject,
  type JsonValue,
  type MagicEdenBuyRequest,
  type MagicEdenBuyResponse,
  type MagicEdenListingSource,
  type MagicEdenPaymentCurrency,
  type MagicEdenTransactionCompatibilityReport,
  type MagicEdenTransactionSnapshot,
} from '@/lib/magic-eden-buy';

const ME_API_KEY = process.env.ME_API_KEY;
const ME_API_BASE = 'https://api-mainnet.magiceden.dev/v2';
const ME_BATCH_BASE = 'https://api-mainnet.magiceden.us/v2';
const CC_AUCTION_HOUSE = 'E8cU1WiRWjanGxmn96ewBgk9vPTcL6AEZ1t6F6fkgUWe';
const USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
const HELIUS_ESCROW_OWNER = '2aSJBUGpWWUZty3dafov1Z8Edw3YPA6Z1e2X3aqXu27i';
const MAGIC_EDEN_ESCROW_OWNER = '1BWutmTvYPwDtmw9abTkS4Ssr8no61spGAvW1X6NDix';
const DEFAULT_RPC_URL = 'https://api.mainnet-beta.solana.com';

type NumericValue = string | number | null | undefined;

type MagicEdenSplPrice = {
  symbol?: string | null;
  currency?: string | null;
  mintAddress?: string | null;
  tokenMint?: string | null;
  address?: string | null;
  rawAmount?: NumericValue;
  amount?: NumericValue;
  price?: NumericValue;
};

type MagicEdenPriceInfo = {
  splPrice?: MagicEdenSplPrice | null;
  solPrice?: {
    rawAmount?: NumericValue;
  } | null;
};

type MagicEdenListing = {
  seller?: string | null;
  tokenAddress?: string | null;
  price?: NumericValue;
  expiry?: number | null;
  auctionHouse?: string | null;
  listingSource?: string | null;
  priceInfo?: MagicEdenPriceInfo | null;
  splPrice?: MagicEdenSplPrice | null;
};

type TransactionWireData = string | Uint8Array | number[] | null | undefined;

type MagicEdenInstructionResponse = {
  v0?: {
    tx?: {
      data?: TransactionWireData;
    } | null;
  } | null;
  tx?: {
    data?: TransactionWireData;
  } | null;
  blockhashData?: {
    blockhash?: string | null;
    lastValidBlockHeight?: number | null;
  } | null;
};

type MagicEdenBatchResult = {
  status?: string;
  reason?: string;
  value?: MagicEdenInstructionResponse | null;
};

type HeliusAsset = ArtifacteAssetLike & {
  ownership?: {
    owner?: string | null;
  } | null;
};

type HeliusAssetResponse = {
  result?: HeliusAsset | null;
};

type ListingPayment = {
  currency: MagicEdenPaymentCurrency;
  rawAmount: number;
  displayAmount: number;
};

export class MagicEdenBuyRouteError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'MagicEdenBuyRouteError';
    this.status = status;
  }
}

export function parseMagicEdenBuyRequest(body: JsonValue): MagicEdenBuyRequest {
  if (!isJsonObject(body)) {
    throw new MagicEdenBuyRouteError('Invalid request body', 400);
  }

  const mint = getRequiredString(body, 'mint');
  const buyer = getRequiredString(body, 'buyer');

  return {
    mint,
    buyer,
    source: getOptionalString(body.source),
    collectionAddress: getOptionalString(body.collectionAddress),
    collectionName: getOptionalString(body.collectionName),
  };
}

export async function buildMagicEdenBuyResponse(
  request: MagicEdenBuyRequest,
): Promise<MagicEdenBuyResponse> {
  if (!ME_API_KEY) {
    throw new MagicEdenBuyRouteError('Server configuration error', 500);
  }

  const listing = await fetchActiveListing(request.mint);
  const seller = getNonEmptyString(listing.seller);
  const price = getPositiveAmount(listing.price);

  if (!seller || price === null) {
    throw new MagicEdenBuyRouteError('Listing is missing seller or price', 502);
  }

  const tokenATA = getNonEmptyString(listing.tokenAddress);
  const listingPayment = detectListingPayment(listing);
  const sellerExpiry = listing.expiry ?? -1;
  const auctionHouse = getNonEmptyString(listing.auctionHouse) ?? null;
  const listingSourceName = getNonEmptyString(listing.listingSource);
  const listingSource: MagicEdenListingSource = !auctionHouse || listingSourceName === 'M3' ? 'M3' : 'M2';

  const heliusAsset = await fetchHeliusAsset(request.mint);
  validateListingOwnership({
    asset: heliusAsset,
    isM3: listingSource === 'M3',
    mint: request.mint,
    seller,
  });

  const feeApplied = shouldApplyExternalMarketplaceFee({
    source: request.source,
    collectionAddress: request.collectionAddress,
    collectionName: request.collectionName,
    asset: heliusAsset,
  });

  const marketplaceResponse = listingSource === 'M3'
    ? await fetchM3BuyTransaction({
        buyer: request.buyer,
        seller,
        mint: request.mint,
        price,
      })
    : await fetchM2BuyTransaction({
        buyer: request.buyer,
        seller,
        mint: request.mint,
        price,
        auctionHouse,
        sellerExpiry,
        tokenATA,
      });

  const originalV0Base64 = toBase64Transaction(marketplaceResponse.v0?.tx?.data);
  const originalLegacyBase64 = toBase64Transaction(marketplaceResponse.tx?.data);

  if (!feeApplied) {
    return {
      v0Tx: originalV0Base64,
      v0TxSigned: null,
      legacyTx: originalLegacyBase64,
      blockhash: marketplaceResponse.blockhashData?.blockhash ?? null,
      lastValidBlockHeight: marketplaceResponse.blockhashData?.lastValidBlockHeight ?? null,
      price: listingPayment.displayAmount,
      displayPrice: listingPayment.displayAmount,
      displayCurrency: listingPayment.currency,
      platformFee: 0,
      platformFeeCurrency: listingPayment.currency,
      feeApplied: false,
      seller,
      mint: request.mint,
      listingSource,
      auctionHouse,
    };
  }

  const connection = new Connection(getHeliusRpcUrl(), 'confirmed');
  const buyerPublicKey = new PublicKey(request.buyer);
  const treasuryPublicKey = new PublicKey(EXTERNAL_MARKETPLACE_FEE_WALLET);
  const platformFeeRawAmount = calculateExternalMarketplaceFeeAmount(listingPayment.rawAmount);
  const platformFee = listingPayment.currency === 'USDC'
    ? platformFeeRawAmount / 1e6
    : platformFeeRawAmount / 1e9;
  const feeInstructions = await buildFeeInstructions({
    buyerPublicKey,
    connection,
    currency: listingPayment.currency,
    platformFeeRawAmount,
    treasuryPublicKey,
  });

  let modifiedV0Base64 = originalV0Base64;
  let modifiedLegacyBase64 = originalLegacyBase64;

  const rawV0 = marketplaceResponse.v0?.tx?.data;
  const rawLegacy = marketplaceResponse.tx?.data;

  if (rawV0) {
    try {
      const originalTransaction = VersionedTransaction.deserialize(decodeTransactionData(rawV0));
      const lookupTables = await loadLookupTables(connection, originalTransaction.message.addressTableLookups);
      const decompiledMessage = TransactionMessage.decompile(originalTransaction.message, {
        addressLookupTableAccounts: lookupTables,
      });

      decompiledMessage.instructions.push(...feeInstructions);

      const recompiledMessage = decompiledMessage.compileToV0Message(lookupTables);
      const modifiedTransaction = new VersionedTransaction(recompiledMessage);
      modifiedV0Base64 = Buffer.from(modifiedTransaction.serialize()).toString('base64');

      const compatibilityReport = buildCompatibilityReport(
        captureVersionedTransactionSnapshot(originalTransaction),
        captureVersionedTransactionSnapshot(modifiedTransaction),
        true,
      );
      logCompatibilityReport(compatibilityReport, request.mint);

      console.log(
        `[me-buy] Injected 2% platform fee: ${platformFee} ${listingPayment.currency} (${platformFeeRawAmount} base units)`,
      );
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error('[me-buy] Failed to inject platform fee:', errorMessage);
      throw new MagicEdenBuyRouteError('Failed to apply Artifacte fee to transaction', 500);
    }
  } else if (rawLegacy) {
    try {
      const originalTransaction = Transaction.from(decodeTransactionData(rawLegacy));
      const modifiedTransaction = Transaction.from(decodeTransactionData(rawLegacy));
      modifiedTransaction.add(...feeInstructions);
      modifiedLegacyBase64 = Buffer.from(
        modifiedTransaction.serialize({ requireAllSignatures: false }),
      ).toString('base64');

      const compatibilityReport = buildCompatibilityReport(
        captureLegacyTransactionSnapshot(originalTransaction),
        captureLegacyTransactionSnapshot(modifiedTransaction),
        true,
      );
      logCompatibilityReport(compatibilityReport, request.mint);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error('[me-buy] Failed to inject platform fee:', errorMessage);
      throw new MagicEdenBuyRouteError('Failed to apply Artifacte fee to transaction', 500);
    }
  } else {
    throw new MagicEdenBuyRouteError('No transaction returned from marketplace', 502);
  }

  return {
    v0Tx: modifiedV0Base64,
    v0TxSigned: null,
    legacyTx: modifiedLegacyBase64,
    blockhash: marketplaceResponse.blockhashData?.blockhash ?? null,
    lastValidBlockHeight: marketplaceResponse.blockhashData?.lastValidBlockHeight ?? null,
    price: listingPayment.displayAmount,
    displayPrice: listingPayment.displayAmount,
    displayCurrency: listingPayment.currency,
    platformFee,
    platformFeeCurrency: listingPayment.currency,
    feeApplied: true,
    seller,
    mint: request.mint,
    listingSource,
    auctionHouse,
  };
}

function isJsonObject(value: JsonValue): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function getOptionalString(value: JsonValue | undefined): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }

  const trimmedValue = value.trim();
  return trimmedValue.length > 0 ? trimmedValue : undefined;
}

function getRequiredString(body: JsonObject, fieldName: string): string {
  const value = getOptionalString(body[fieldName]);
  if (!value) {
    throw new MagicEdenBuyRouteError(`Missing ${fieldName}`, 400);
  }

  return value;
}

function getNonEmptyString(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }

  const trimmedValue = value.trim();
  return trimmedValue.length > 0 ? trimmedValue : null;
}

function getPositiveAmount(value: NumericValue): number | null {
  const amount = Number(value);
  return Number.isFinite(amount) && amount > 0 ? amount : null;
}

function toBaseUnits(value: NumericValue, decimals: number): number | null {
  const amount = getPositiveAmount(value);
  return amount === null ? null : Math.round(amount * 10 ** decimals);
}

function detectListingPayment(listing: MagicEdenListing): ListingPayment {
  const splPrice = listing.priceInfo?.splPrice ?? listing.splPrice;
  const splSymbol = String(splPrice?.symbol ?? splPrice?.currency ?? '').toUpperCase();
  const splMint = String(
    splPrice?.mintAddress ?? splPrice?.tokenMint ?? splPrice?.address ?? '',
  ).trim();
  const rawUsdcAmount = getPositiveAmount(splPrice?.rawAmount)
    ?? toBaseUnits(splPrice?.amount ?? splPrice?.price, 6);

  if (rawUsdcAmount && (splSymbol === 'USDC' || splMint === USDC_MINT)) {
    return {
      currency: 'USDC',
      rawAmount: rawUsdcAmount,
      displayAmount: rawUsdcAmount / 1e6,
    };
  }

  const rawSolAmount = getPositiveAmount(listing.priceInfo?.solPrice?.rawAmount)
    ?? toBaseUnits(listing.price, 9)
    ?? 0;

  return {
    currency: 'SOL',
    rawAmount: rawSolAmount,
    displayAmount: rawSolAmount / 1e9,
  };
}

async function fetchActiveListing(mint: string): Promise<MagicEdenListing> {
  const response = await fetch(`${ME_API_BASE}/tokens/${mint}/listings`, {
    headers: { Authorization: `Bearer ${ME_API_KEY}` },
    cache: 'no-store',
  });

  if (!response.ok) {
    throw new MagicEdenBuyRouteError('Failed to fetch listing', 502);
  }

  const listings = (await response.json()) as MagicEdenListing[];
  if (!Array.isArray(listings) || listings.length === 0) {
    throw new MagicEdenBuyRouteError('No active listing found', 404);
  }

  return listings[0] as MagicEdenListing;
}

async function fetchHeliusAsset(mint: string): Promise<HeliusAsset | null> {
  if (!process.env.HELIUS_API_KEY) {
    return null;
  }

  try {
    const response = await fetch(getHeliusRpcUrl(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'getAsset',
        params: { id: mint },
      }),
      cache: 'no-store',
    });

    if (!response.ok) {
      return null;
    }

    const payload = (await response.json()) as HeliusAssetResponse;
    return payload.result ?? null;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.warn('[me-buy] Ownership check failed, proceeding:', errorMessage);
    return null;
  }
}

function validateListingOwnership(input: {
  asset: HeliusAsset | null;
  isM3: boolean;
  mint: string;
  seller: string;
}): void {
  if (!input.asset || input.isM3) {
    return;
  }

  const currentOwner = getNonEmptyString(input.asset.ownership?.owner);
  if (
    currentOwner
    && currentOwner !== input.seller
    && currentOwner !== HELIUS_ESCROW_OWNER
    && currentOwner !== MAGIC_EDEN_ESCROW_OWNER
  ) {
    console.log('[me-buy] Ownership mismatch:', {
      currentOwner,
      seller: input.seller,
      mint: input.mint,
      isM3: input.isM3,
    });
    throw new MagicEdenBuyRouteError(
      'This listing is no longer available — the NFT has already been sold.',
      410,
    );
  }
}

async function fetchM3BuyTransaction(input: {
  buyer: string;
  seller: string;
  mint: string;
  price: number;
}): Promise<MagicEdenInstructionResponse> {
  const q = JSON.stringify([
    {
      type: 'm3_buy_now',
      ins: {
        buyer: input.buyer,
        seller: input.seller,
        assetId: input.mint,
        price: input.price,
      },
    },
  ]);

  const batchUrl = `${ME_BATCH_BASE}/instructions/batch?q=${encodeURIComponent(q)}&prioFeeMicroLamports=50000&maxPrioFeeLamports=10000000`;
  const response = await fetch(batchUrl, {
    headers: { Authorization: `Bearer ${ME_API_KEY}` },
    signal: AbortSignal.timeout(15000),
    cache: 'no-store',
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('[me-buy] ME batch API error:', errorText);
    throw new MagicEdenBuyRouteError(`ME API error: ${errorText}`, 502);
  }

  const results = (await response.json()) as MagicEdenBatchResult[];
  const result = results[0];

  if (!result) {
    throw new MagicEdenBuyRouteError('ME API returned an empty batch response', 502);
  }

  if (result.status === 'rejected') {
    console.error('[me-buy] M3 buy rejected:', result.reason ?? 'unknown reason');
    throw new MagicEdenBuyRouteError(result.reason ?? 'Magic Eden rejected the buy transaction', 502);
  }

  if (!result.value) {
    throw new MagicEdenBuyRouteError('ME API returned an empty M3 transaction payload', 502);
  }

  return result.value;
}

async function fetchM2BuyTransaction(input: {
  buyer: string;
  seller: string;
  mint: string;
  price: number;
  auctionHouse: string | null;
  sellerExpiry: number;
  tokenATA: string | null;
}): Promise<MagicEdenInstructionResponse> {
  const params = new URLSearchParams({
    buyer: input.buyer,
    seller: input.seller,
    tokenMint: input.mint,
    price: input.price.toString(),
    auctionHouseAddress: input.auctionHouse ?? CC_AUCTION_HOUSE,
  });

  if (input.tokenATA) {
    params.set('tokenATA', input.tokenATA);
  }

  if (input.sellerExpiry !== -1) {
    params.set('sellerExpiry', input.sellerExpiry.toString());
  }

  const response = await fetch(`${ME_API_BASE}/instructions/buy_now?${params.toString()}`, {
    headers: { Authorization: `Bearer ${ME_API_KEY}` },
    signal: AbortSignal.timeout(15000),
    cache: 'no-store',
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('[me-buy] ME API error:', errorText);
    throw new MagicEdenBuyRouteError(`ME API error: ${errorText}`, 502);
  }

  return (await response.json()) as MagicEdenInstructionResponse;
}

async function buildFeeInstructions(input: {
  buyerPublicKey: PublicKey;
  connection: Connection;
  currency: MagicEdenPaymentCurrency;
  platformFeeRawAmount: number;
  treasuryPublicKey: PublicKey;
}): Promise<TransactionInstruction[]> {
  if (input.currency === 'SOL') {
    return [
      SystemProgram.transfer({
        fromPubkey: input.buyerPublicKey,
        toPubkey: input.treasuryPublicKey,
        lamports: input.platformFeeRawAmount,
      }),
    ];
  }

  const usdcMintPublicKey = new PublicKey(USDC_MINT);
  const buyerUsdcAta = await getAssociatedTokenAddress(usdcMintPublicKey, input.buyerPublicKey);
  const treasuryUsdcAta = await getAssociatedTokenAddress(usdcMintPublicKey, input.treasuryPublicKey);
  const treasuryAtaInfo = await input.connection.getAccountInfo(treasuryUsdcAta);
  const instructions: TransactionInstruction[] = [];

  if (!treasuryAtaInfo) {
    instructions.push(
      createAssociatedTokenAccountInstruction(
        input.buyerPublicKey,
        treasuryUsdcAta,
        input.treasuryPublicKey,
        usdcMintPublicKey,
      ),
    );
  }

  instructions.push(
    createTransferInstruction(
      buyerUsdcAta,
      treasuryUsdcAta,
      input.buyerPublicKey,
      input.platformFeeRawAmount,
    ),
  );

  return instructions;
}

async function loadLookupTables(
  connection: Connection,
  lookups: readonly MessageAddressTableLookup[],
): Promise<AddressLookupTableAccount[]> {
  const lookupTables = await Promise.all(
    lookups.map(async (lookup) => {
      const result = await connection.getAddressLookupTable(lookup.accountKey);
      return result.value;
    }),
  );

  return lookupTables.filter((table): table is AddressLookupTableAccount => table !== null);
}

function toBase64Transaction(data: TransactionWireData): string | null {
  if (!data) {
    return null;
  }

  if (typeof data === 'string') {
    return Buffer.from(data, 'base64').toString('base64');
  }

  return Buffer.from(data).toString('base64');
}

function decodeTransactionData(data: TransactionWireData): Uint8Array {
  if (typeof data === 'string') {
    return Uint8Array.from(Buffer.from(data, 'base64'));
  }

  if (data instanceof Uint8Array) {
    return data;
  }

  if (Array.isArray(data)) {
    return Uint8Array.from(data);
  }

  throw new MagicEdenBuyRouteError('Transaction payload is missing', 502);
}

function captureVersionedTransactionSnapshot(
  transaction: VersionedTransaction,
): MagicEdenTransactionSnapshot {
  return {
    kind: 'v0',
    requiredSignatureCount: transaction.message.header.numRequiredSignatures,
    signatureCount: transaction.signatures.length,
    feePayer: transaction.message.staticAccountKeys[0]?.toBase58() ?? null,
    lookupTableCount: transaction.message.addressTableLookups.length,
    hasMagicEdenProgram: hasMagicEdenProgram(transaction.message.staticAccountKeys),
  };
}

function captureLegacyTransactionSnapshot(transaction: Transaction): MagicEdenTransactionSnapshot {
  const message = transaction.compileMessage();

  return {
    kind: 'legacy',
    requiredSignatureCount: message.header.numRequiredSignatures,
    signatureCount: transaction.signatures.length,
    feePayer: transaction.feePayer?.toBase58() ?? message.accountKeys[0]?.toBase58() ?? null,
    lookupTableCount: 0,
    hasMagicEdenProgram: hasMagicEdenProgram(message.accountKeys),
  };
}

function hasMagicEdenProgram(accountKeys: readonly PublicKey[]): boolean {
  return accountKeys.some((accountKey) => {
    const address = accountKey.toBase58();
    return address === MAGIC_EDEN_M2_PROGRAM || address === MAGIC_EDEN_M3_PROGRAM;
  });
}

function buildCompatibilityReport(
  original: MagicEdenTransactionSnapshot | null,
  modified: MagicEdenTransactionSnapshot | null,
  feeApplied: boolean,
): MagicEdenTransactionCompatibilityReport {
  return {
    original,
    modified,
    feeApplied,
    changedRequiredSignatureCount:
      original?.requiredSignatureCount !== modified?.requiredSignatureCount,
    changedSignatureCount: original?.signatureCount !== modified?.signatureCount,
    changedFeePayer: original?.feePayer !== modified?.feePayer,
  };
}

function logCompatibilityReport(
  report: MagicEdenTransactionCompatibilityReport,
  mint: string,
): void {
  if (
    report.changedRequiredSignatureCount
    || report.changedSignatureCount
    || report.changedFeePayer
  ) {
    console.warn('[me-buy] Transaction compatibility changed after fee injection', {
      mint,
      report,
    });
  }
}

function getHeliusRpcUrl(): string {
  return process.env.HELIUS_API_KEY
    ? `https://mainnet.helius-rpc.com/?api-key=${process.env.HELIUS_API_KEY}`
    : DEFAULT_RPC_URL;
}
