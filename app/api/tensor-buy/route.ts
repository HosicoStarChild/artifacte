import { NextResponse } from 'next/server';
import {
  createBase64VersionedTransaction,
  waitForWeb3Confirmation,
} from '@/app/api/_lib/list-route-utils';
import {
  LOOKUP_TABLE_ACTIVATION_DELAY_MS,
  MAX_LOOKUP_TABLE_EXTEND_ADDRESSES,
  MAX_SOLANA_TRANSACTION_BYTES,
  isUint8EncodingOverrun,
  planLookupTableSetupBatchSizes,
  toBase64SizedSerializedTransaction,
} from './_lib/serialization';
import {
  EXTERNAL_MARKETPLACE_FEE_WALLET,
  calculateExternalMarketplaceFeeAmount,
  shouldApplyExternalMarketplaceFee,
  type ArtifacteAssetLike,
} from '@/lib/external-purchase-fees';
import { getOracleApiUrl } from '@/lib/server/oracle-env';

const HELIUS_RPC = `https://mainnet.helius-rpc.com/?api-key=${process.env.HELIUS_API_KEY}`;
const TENSOR_API_BASE = 'https://api.mainnet.tensordev.io/api/v1';
const USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
type HeliusAsset = ArtifacteAssetLike & {
  compression?: {
    compressed?: boolean;
  } | null;
};

type OracleTensorListing = {
  nftAddress?: string;
  seller?: string;
  price?: number;
  currency?: string;
  marketplace?: string;
  source?: string;
};

type OracleListingsResponse = {
  listings?: OracleTensorListing[];
};

type HeliusAssetResponse = {
  result?: HeliusAsset | null;
};

type TensorBufferData = {
  data?: number[];
  type?: string;
};

type TensorWireData = string | number[] | Uint8Array | TensorBufferData | null | undefined;

type TensorTxRecord = {
  tx?: TensorWireData;
  txV0?: TensorWireData;
  lastValidBlockHeight?: number | null;
};

type TensorTxPayload = {
  txs?: TensorTxRecord[];
};

type TensorCreatorTuple = [
  string,
  ...(string | number | boolean | null | undefined)[],
];

function toBase64(value: TensorWireData): string | null {
  if (!value) return null;
  if (typeof value === 'string') return value;
  if (Array.isArray(value) || value instanceof Uint8Array) {
    return Buffer.from(value).toString('base64');
  }

  if (Array.isArray(value.data)) {
    return Buffer.from(value.data).toString('base64');
  }

  return null;
}

function unwrapWireData(value: TensorWireData): TensorWireData {
  if (!value || typeof value === 'string' || Array.isArray(value) || value instanceof Uint8Array) {
    return value;
  }

  return value.data;
}

function toBuffer(value: Exclude<TensorWireData, null | undefined>): Buffer {
  if (typeof value === 'string') {
    return Buffer.from(value, 'base64');
  }

  if (Array.isArray(value) || value instanceof Uint8Array) {
    return Buffer.from(value);
  }

  return Buffer.from(value.data ?? []);
}

async function fetchHeliusAsset(mint: string): Promise<HeliusAsset | null> {
  try {
    const assetResponse = await fetch(HELIUS_RPC, {
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
    const assetPayload = (await assetResponse.json()) as HeliusAssetResponse;
    return assetPayload.result ?? null;
  } catch (error) {
    console.warn('[tensor-buy] Failed to load Helius asset for fee context:', error);
    return null;
  }
}

async function fetchOracleTensorListing(mint: string): Promise<OracleTensorListing | null> {
  const oracleUrl = getOracleApiUrl();
  const response = await fetch(
    `${oracleUrl}/api/listings?q=${encodeURIComponent(mint)}&perPage=10`,
    {
      cache: 'no-store',
      signal: AbortSignal.timeout(12000),
    },
  );

  if (!response.ok) {
    return null;
  }

  const payload = (await response.json()) as OracleListingsResponse;
  const listings = Array.isArray(payload.listings) ? payload.listings : [];

  return listings.find((listing) => {
    if (listing.nftAddress !== mint) {
      return false;
    }

    if (listing.marketplace === 'tensor') {
      return true;
    }

    return (
      listing.source === 'phygitals' ||
      (listing.source === 'collector-crypt' && String(listing.currency || '').trim().toUpperCase() === 'USDC')
    );
  }) ?? null;
}

function getListingCurrencyDecimals(currency: string): 6 | 9 {
  return currency === 'USDC' ? 6 : 9;
}

function readTensorOptionValue<T>(
  option: { __option?: string; value?: T } | null | undefined,
): T | undefined {
  return option?.__option === 'Some' ? option.value : undefined;
}

async function buildStandardTensorBuyResponse(input: {
  mint: string;
  buyer: string;
  source?: string;
  collectionAddress?: string;
  collectionName?: string;
  heliusAsset: HeliusAsset | null;
}) {
  if (!process.env.TENSOR_API_KEY) {
    throw new Error('TENSOR_API_KEY is not configured');
  }

  const listing = await fetchOracleTensorListing(input.mint);
  if (!listing?.seller || typeof listing.price !== 'number' || !Number.isFinite(listing.price) || listing.price <= 0) {
    throw new Error('Listing not found or no longer available');
  }

  const listingCurrency = String(listing.currency || 'SOL').trim().toUpperCase() === 'USDC' ? 'USDC' : 'SOL';
  const decimals = getListingCurrencyDecimals(listingCurrency);
  const priceRaw = Math.round(listing.price * 10 ** decimals);

  const { Connection, PublicKey, SystemProgram, Transaction, TransactionMessage, VersionedTransaction } = await import('@solana/web3.js');
  const connection = new Connection(HELIUS_RPC, 'confirmed');
  const latestBlockhash = await connection.getLatestBlockhash('finalized');

  const params = new URLSearchParams({
    buyer: input.buyer,
    mint: input.mint,
    owner: listing.seller,
    maxPrice: String(priceRaw),
    blockhash: latestBlockhash.blockhash,
  });

  const response = await fetch(`${TENSOR_API_BASE}/tx/buy?${params.toString()}`, {
    headers: {
      accept: 'application/json',
      'x-tensor-api-key': process.env.TENSOR_API_KEY,
    },
    cache: 'no-store',
    signal: AbortSignal.timeout(15000),
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || 'Failed to build Tensor buy transaction');
  }

  const payload = (await response.json()) as TensorTxPayload;
  const txs = Array.isArray(payload?.txs) ? payload.txs : [];
  const firstTx = txs[0];
  const txV0Data = unwrapWireData(firstTx?.txV0);
  const txData = unwrapWireData(firstTx?.tx);
  const raw = txV0Data || txData;

  if (!raw) {
    throw new Error('Tensor did not return any transactions');
  }

  const feeApplied = shouldApplyExternalMarketplaceFee({
    source: input.source,
    collectionAddress: input.collectionAddress,
    collectionName: input.collectionName,
    asset: input.heliusAsset,
  });

  if (!feeApplied) {
    return {
      tx: toBase64(raw),
      price: listing.price,
      platformFee: 0,
      platformFeeCurrency: listingCurrency,
      feeApplied: false,
      currency: listingCurrency,
      seller: listing.seller,
      mint: input.mint,
    };
  }

  const txBytes = toBuffer(raw);

  const buyerPk = new PublicKey(input.buyer);
  const treasuryPk = new PublicKey(EXTERNAL_MARKETPLACE_FEE_WALLET);
  const feeAmount = calculateExternalMarketplaceFeeAmount(priceRaw);
  let encodedTx: string;

  if (txV0Data) {
    const vTx = VersionedTransaction.deserialize(Uint8Array.from(txBytes));
    const altAccounts = await Promise.all(
      vTx.message.addressTableLookups.map(async (lookup) => {
        const result = await connection.getAddressLookupTable(lookup.accountKey);
        return result.value;
      }),
    );
    const validAlts = altAccounts.filter((account): account is NonNullable<typeof account> => account != null);
    const decompiled = TransactionMessage.decompile(vTx.message, {
      addressLookupTableAccounts: validAlts,
    });

    if (listingCurrency === 'USDC') {
      const { getAssociatedTokenAddress, createAssociatedTokenAccountInstruction, createTransferInstruction } = await import('@solana/spl-token');
      const usdcMintPk = new PublicKey(USDC_MINT);
      const buyerUsdcAta = await getAssociatedTokenAddress(usdcMintPk, buyerPk);
      const treasuryUsdcAta = await getAssociatedTokenAddress(usdcMintPk, treasuryPk);
      const treasuryAtaInfo = await connection.getAccountInfo(treasuryUsdcAta);

      if (!treasuryAtaInfo) {
        decompiled.instructions.push(
          createAssociatedTokenAccountInstruction(buyerPk, treasuryUsdcAta, treasuryPk, usdcMintPk),
        );
      }

      decompiled.instructions.push(
        createTransferInstruction(buyerUsdcAta, treasuryUsdcAta, buyerPk, feeAmount),
      );
    } else {
      decompiled.instructions.push(
        SystemProgram.transfer({
          fromPubkey: buyerPk,
          toPubkey: treasuryPk,
          lamports: feeAmount,
        }),
      );
    }

    const recompiled = decompiled.compileToV0Message(validAlts);
    encodedTx = toBase64SizedSerializedTransaction(
      () => new VersionedTransaction(recompiled).serialize(),
      'Tensor buy transaction exceeds Solana size limits after fee injection',
    );
  } else {
    const legacyTx = Transaction.from(txBytes);

    if (listingCurrency === 'USDC') {
      const { getAssociatedTokenAddress, createAssociatedTokenAccountInstruction, createTransferInstruction } = await import('@solana/spl-token');
      const usdcMintPk = new PublicKey(USDC_MINT);
      const buyerUsdcAta = await getAssociatedTokenAddress(usdcMintPk, buyerPk);
      const treasuryUsdcAta = await getAssociatedTokenAddress(usdcMintPk, treasuryPk);
      const treasuryAtaInfo = await connection.getAccountInfo(treasuryUsdcAta);

      if (!treasuryAtaInfo) {
        legacyTx.add(createAssociatedTokenAccountInstruction(buyerPk, treasuryUsdcAta, treasuryPk, usdcMintPk));
      }

      legacyTx.add(createTransferInstruction(buyerUsdcAta, treasuryUsdcAta, buyerPk, feeAmount));
    } else {
      legacyTx.add(SystemProgram.transfer({ fromPubkey: buyerPk, toPubkey: treasuryPk, lamports: feeAmount }));
    }

    encodedTx = toBase64SizedSerializedTransaction(
      () => legacyTx.serialize({ requireAllSignatures: false }),
      'Tensor buy transaction exceeds Solana size limits after fee injection',
    );
  }

  return {
    tx: encodedTx,
    price: listing.price,
    platformFee: feeAmount / 10 ** decimals,
    platformFeeCurrency: listingCurrency,
    feeApplied: true,
    currency: listingCurrency,
    seller: listing.seller,
    mint: input.mint,
  };
}

export async function POST(request: Request) {
  try {
    const { mint, buyer, source, collectionAddress, collectionName } = await request.json();
    if (!mint || !buyer) return NextResponse.json({ error: 'Missing mint or buyer' }, { status: 400 });

    const heliusAsset = await fetchHeliusAsset(mint);

    if (!heliusAsset?.compression?.compressed) {
      const standardResponse = await buildStandardTensorBuyResponse({
        mint,
        buyer,
        source,
        collectionAddress,
        collectionName,
        heliusAsset,
      });

      return NextResponse.json(standardResponse);
    }

    // Dynamic imports for Tensor SDK (uses @solana/web3.js v2 internally)
    const {
      getBuyCompressedInstructionAsync,
      getBuySplCompressedInstructionAsync,
      fetchListState,
      findListStatePda,
    } = await import('@tensor-foundation/marketplace');
    const { retrieveAssetFields, retrieveProofFields, getCNFTArgs } = await import('@tensor-foundation/common-helpers');
    const { createSolanaRpc, address } = await import('@solana/kit');

    const rpc = createSolanaRpc(HELIUS_RPC);
    type TensorCnftRpc = Parameters<typeof getCNFTArgs>[0];
    type TensorListStateRpc = Parameters<typeof fetchListState>[0];
    type TensorCompressedBuyInput = Parameters<typeof getBuyCompressedInstructionAsync>[0];
    type TensorCompressedSplBuyInput = Parameters<typeof getBuySplCompressedInstructionAsync>[0];
    type TensorPayer = TensorCompressedBuyInput['payer'];
    type TensorBuyInstruction =
      | Awaited<ReturnType<typeof getBuyCompressedInstructionAsync>>
      | Awaited<ReturnType<typeof getBuySplCompressedInstructionAsync>>;

    const buyerAddress = address(buyer);
    const fakeSigner = {
      address: buyerAddress,
      signTransactions: async () => [],
    } as never as TensorPayer;

    const [assetFields, proofFields] = await Promise.all([
      retrieveAssetFields(HELIUS_RPC, mint),
      retrieveProofFields(HELIUS_RPC, mint),
    ]);

    const cnftArgs = await getCNFTArgs(rpc as never as TensorCnftRpc, mint, assetFields, proofFields);
    const [listStatePda] = await findListStatePda({ mint: address(mint) });
    const listState = await fetchListState(rpc as never as TensorListStateRpc, listStatePda);

    const feeApplied = shouldApplyExternalMarketplaceFee({
      source,
      collectionAddress,
      collectionName,
      asset: heliusAsset,
    });

    const makerBrokerValue = readTensorOptionValue(listState.data.makerBroker);
    const makerBroker = makerBrokerValue ? address(String(makerBrokerValue)) : undefined;
    const rentDest = listState.data.rentPayer || listState.data.owner;
    const creatorTuples = (cnftArgs.creators ?? []) as TensorCreatorTuple[];
    const creatorAddresses = creatorTuples.map((creator) => address(creator[0]));
    const creatorPath = creatorTuples.map((creator) => [address(creator[0]), Number(creator[1] ?? 0)] as const);
    const trimmedProof = proofFields.proof.map((p: string) => address(p));
    const listCurrencyValue = readTensorOptionValue(listState.data.currency);
    const listCurrencyMint = listCurrencyValue ? String(listCurrencyValue) : null;

    if (listCurrencyMint && listCurrencyMint !== USDC_MINT) {
      throw new Error(`Unsupported Tensor compressed currency mint: ${listCurrencyMint}`);
    }

    const listingCurrency = listCurrencyMint === USDC_MINT ? 'USDC' : 'SOL';
    const decimals = getListingCurrencyDecimals(listingCurrency);
    const price = Number(listState.data.amount) / 10 ** decimals;
    const maxAmount = BigInt(listState.data.amount) * BigInt(105) / BigInt(100);

    let buyIx: TensorBuyInstruction;

    if (listingCurrency === 'USDC') {
      const compressedBuyInput: TensorCompressedSplBuyInput = {
        merkleTree: cnftArgs.merkleTree,
        listState: listStatePda,
        payer: fakeSigner,
        buyer: buyerAddress as never,
        owner: listState.data.owner as never,
        rentDestination: rentDest as never,
        currency: address(USDC_MINT) as never,
        makerBroker: makerBroker as never,
        takerBroker: feeApplied ? address(EXTERNAL_MARKETPLACE_FEE_WALLET) as never : undefined,
        index: cnftArgs.index,
        root: cnftArgs.root,
        metaHash: cnftArgs.metaHash,
        creatorShares: cnftArgs.creatorShares,
        creatorVerified: cnftArgs.creatorVerified,
        sellerFeeBasisPoints: cnftArgs.sellerFeeBasisPoints,
        maxAmount,
        optionalRoyaltyPct: 100,
        creators: creatorAddresses as never,
        proof: trimmedProof as never,
        canopyDepth: 0,
      };

      buyIx = await getBuySplCompressedInstructionAsync(compressedBuyInput);
    } else {
      const compressedBuyInput: TensorCompressedBuyInput = {
        merkleTree: cnftArgs.merkleTree,
        listState: listStatePda,
        payer: fakeSigner,
        buyer: buyerAddress as never,
        owner: listState.data.owner as never,
        rentDestination: rentDest as never,
        makerBroker: makerBroker as never,
        takerBroker: feeApplied ? address(EXTERNAL_MARKETPLACE_FEE_WALLET) as never : undefined,
        index: cnftArgs.index,
        root: cnftArgs.root,
        metaHash: cnftArgs.metaHash,
        creatorShares: cnftArgs.creatorShares,
        creatorVerified: cnftArgs.creatorVerified,
        sellerFeeBasisPoints: cnftArgs.sellerFeeBasisPoints,
        maxAmount,
        optionalRoyaltyPct: 100,
        creators: creatorPath as never,
        proof: trimmedProof as never,
        canopyDepth: 0,
      };

      buyIx = await getBuyCompressedInstructionAsync(compressedBuyInput);
    }

    const {
      PublicKey,
      Connection: SolConnection,
      AddressLookupTableProgram,
      Transaction,
      Keypair,
    } = await import('@solana/web3.js');

    const conn = new SolConnection(HELIUS_RPC, 'confirmed');
    const buyInstruction = buyIx as TensorBuyInstruction;

    // Phygitals' program ALT (59 addresses covering all Tensor/Bubblegum/compression programs)
    const PROGRAM_ALT = new PublicKey('4NYENhRXdSq1ek7mvJyzMUvdn2aN3JeAr6huzfL7869j');
    const proofAddresses = proofFields.proof.map((p: string) => new PublicKey(p));

    const maybeBuildCompressedBuyTransaction = async (
      lookupTables: NonNullable<Awaited<ReturnType<typeof conn.getAddressLookupTable>>['value']>[],
      blockhashOverride: Awaited<ReturnType<typeof conn.getLatestBlockhash>>,
    ) => {
      try {
        const txBase64 = await createBase64VersionedTransaction({
          connection: {
            ...conn,
            getLatestBlockhash: async () => blockhashOverride,
          } as typeof conn,
          instruction: buyInstruction as never,
          lookupTables,
          payer: buyer,
        });

        return {
          txBase64,
          txSize: Buffer.from(txBase64, 'base64').length,
        };
      } catch (error) {
        if (isUint8EncodingOverrun(error)) {
          return null;
        }

        throw error;
      }
    };

    const [programAlt, initialBlockhash] = await Promise.all([
      conn.getAddressLookupTable(PROGRAM_ALT),
      conn.getLatestBlockhash('confirmed'),
    ]);
    const baseLookupTables = [programAlt.value].filter((value): value is NonNullable<typeof value> => value != null);

    let txBuild = await maybeBuildCompressedBuyTransaction(baseLookupTables, initialBlockhash);
    let proofAltAddress: InstanceType<typeof PublicKey> | null = null;

    if ((!txBuild || txBuild.txSize > MAX_SOLANA_TRANSACTION_BYTES) && proofAddresses.length > 0) {
      const authoritySecret = JSON.parse(process.env.SOLANA_AUTHORITY_SECRET || '[]');
      if (authoritySecret.length === 0) {
        throw new Error('SOLANA_AUTHORITY_SECRET not configured');
      }

      const authority = Keypair.fromSecretKey(Uint8Array.from(authoritySecret));
      const slot = await conn.getSlot();
      const [createIx, nextProofAltAddress] = AddressLookupTableProgram.createLookupTable({
        authority: authority.publicKey,
        payer: authority.publicKey,
        recentSlot: slot - 1,
      });

      const plannedBatchSizes = await planLookupTableSetupBatchSizes({
        addressCount: proofAddresses.length,
        maxBatchSize: MAX_LOOKUP_TABLE_EXTEND_ADDRESSES,
        fitsWithinLimit: async (batchSize, shouldIncludeCreateInstruction) => {
          const batchAddresses = proofAddresses.slice(nextOffset, nextOffset + batchSize);
          const extendIx = AddressLookupTableProgram.extendLookupTable({
            payer: authority.publicKey,
            authority: authority.publicKey,
            lookupTable: nextProofAltAddress,
            addresses: batchAddresses,
          });
          const setupTx = new Transaction();

          if (shouldIncludeCreateInstruction) {
            setupTx.add(createIx);
          }

          setupTx.add(extendIx);

          const { blockhash } = await conn.getLatestBlockhash('confirmed');
          setupTx.recentBlockhash = blockhash;
          setupTx.feePayer = authority.publicKey;
          setupTx.sign(authority);

          try {
            return setupTx.serialize().length <= MAX_SOLANA_TRANSACTION_BYTES;
          } catch (error) {
            if (isUint8EncodingOverrun(error) || error instanceof RangeError) {
              return false;
            }

            throw error;
          }
        },
      });

      let nextOffset = 0;
      let includeCreateInstruction = true;

      for (const batchSize of plannedBatchSizes) {
        let batchAddresses = proofAddresses.slice(nextOffset, nextOffset + batchSize);
        const extendIx = AddressLookupTableProgram.extendLookupTable({
          payer: authority.publicKey,
          authority: authority.publicKey,
          lookupTable: nextProofAltAddress,
          addresses: batchAddresses,
        });
        const setupTx = new Transaction();

        if (includeCreateInstruction) {
          setupTx.add(createIx);
        }

        setupTx.add(extendIx);

        const { blockhash } = await conn.getLatestBlockhash('confirmed');
        setupTx.recentBlockhash = blockhash;
        setupTx.feePayer = authority.publicKey;
        setupTx.sign(authority);
        const serializedSetupTx = setupTx.serialize();

        if (serializedSetupTx.length > MAX_SOLANA_TRANSACTION_BYTES) {
          throw new Error('Tensor proof lookup table setup exceeds Solana size limits');
        }

        const altSig = await conn.sendRawTransaction(serializedSetupTx, { skipPreflight: true });
        await waitForWeb3Confirmation(conn, altSig);
        nextOffset += batchAddresses.length;
        includeCreateInstruction = false;
      }

      await new Promise((resolve) => setTimeout(resolve, LOOKUP_TABLE_ACTIVATION_DELAY_MS));
      proofAltAddress = nextProofAltAddress;

      const [proofAlt, finalBlockhash] = await Promise.all([
        conn.getAddressLookupTable(proofAltAddress),
        conn.getLatestBlockhash('confirmed'),
      ]);

      if (!proofAlt.value) {
        throw new Error('Tensor proof lookup table failed to activate');
      }

      const lookupTables = [...baseLookupTables, proofAlt.value];
      txBuild = await maybeBuildCompressedBuyTransaction(lookupTables, finalBlockhash);
    }

    if (!txBuild || txBuild.txSize > MAX_SOLANA_TRANSACTION_BYTES) {
      throw new Error('Tensor compressed buy transaction exceeds Solana size limits');
    }

    // Tensor applies the buyer-side broker fee through `takerBroker`; do not append
    // a second transfer here or the buyer is charged twice.
    const platformFeeAmount = feeApplied
      ? calculateExternalMarketplaceFeeAmount(Number(listState.data.amount))
      : 0;
    const platformFee = platformFeeAmount / 10 ** decimals;
    console.log(`[tensor-buy] tx size: ${txBuild.txSize} bytes (proof nodes: ${proofFields.proof.length}, proof ALT: ${proofAltAddress?.toBase58() ?? 'none'}, currency: ${listingCurrency}, platformFee: ${platformFee.toFixed(6)} ${listingCurrency}, feeApplied: ${feeApplied})`);

    return NextResponse.json({
      tx: txBuild.txBase64,
      price,
      platformFee,
      platformFeeCurrency: listingCurrency,
      feeApplied,
      currency: listingCurrency,
      seller: String(listState.data.owner),
      mint,
    });

  } catch (err) {
    console.error('[tensor-buy] Error:', err);
    const msg = err instanceof Error ? err.message : typeof err === 'string' ? err : '';
    if (msg.includes('Account not found') || msg.includes('3230000')) {
      return NextResponse.json({ error: 'This listing is no longer available. It may have been sold or delisted.' }, { status: 404 });
    }
    return NextResponse.json({ error: msg || 'Failed to build Tensor buy tx' }, { status: 500 });
  }
}

export const maxDuration = 60;
