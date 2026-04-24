import { NextResponse } from 'next/server';
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
    encodedTx = Buffer.from(new VersionedTransaction(recompiled).serialize()).toString('base64');
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

    encodedTx = Buffer.from(legacyTx.serialize({ requireAllSignatures: false })).toString('base64');
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
      PublicKey, TransactionMessage, VersionedTransaction, TransactionInstruction,
      ComputeBudgetProgram, Connection: SolConnection, SystemProgram,
      AddressLookupTableProgram, Transaction, Keypair,
    } = await import('@solana/web3.js');

    const conn = new SolConnection(HELIUS_RPC, 'confirmed');
    const buyerPk = new PublicKey(buyer);

    const buyInstruction = buyIx as TensorBuyInstruction;
    const v1Keys = buyInstruction.accounts.map((acct) => {
      const addr = String(acct.address);
      return {
        pubkey: new PublicKey(addr),
        isSigner: acct.role >= 2,
        isWritable: acct.role === 1 || acct.role === 3,
      };
    });

    const v1Ix = new TransactionInstruction({
      programId: new PublicKey(String(buyInstruction.programAddress)),
      keys: v1Keys,
      data: Buffer.from(buyInstruction.data),
    });

    // Phygitals' program ALT (59 addresses covering all Tensor/Bubblegum/compression programs)
    const PROGRAM_ALT = new PublicKey('4NYENhRXdSq1ek7mvJyzMUvdn2aN3JeAr6huzfL7869j');

    // Create a per-tx proof ALT with this card's proof nodes
    // This is how Phygitals handles tx size — compress proof nodes via a fresh ALT
    const authoritySecret = JSON.parse(process.env.SOLANA_AUTHORITY_SECRET || '[]');
    if (authoritySecret.length === 0) {
      throw new Error('SOLANA_AUTHORITY_SECRET not configured');
    }
    const authority = Keypair.fromSecretKey(Uint8Array.from(authoritySecret));

    const slot = await conn.getSlot();
    const [createIx, proofAltAddress] = AddressLookupTableProgram.createLookupTable({
      authority: authority.publicKey,
      payer: authority.publicKey,
      recentSlot: slot - 1,
    });

    const proofAddresses = proofFields.proof.map((p: string) => new PublicKey(p));
    const extendIx = AddressLookupTableProgram.extendLookupTable({
      payer: authority.publicKey,
      authority: authority.publicKey,
      lookupTable: proofAltAddress,
      addresses: proofAddresses,
    });

    // Create + extend in one tx
    const { blockhash: altBh } = await conn.getLatestBlockhash('confirmed');
    const altTx = new Transaction().add(createIx).add(extendIx);
    altTx.recentBlockhash = altBh;
    altTx.feePayer = authority.publicKey;
    altTx.sign(authority);
    const altSig = await conn.sendRawTransaction(altTx.serialize(), { skipPreflight: true });

    // Poll for ALT tx confirmation (avoids WebSocket issues in Next.js server)
    for (let i = 0; i < 30; i++) {
      const status = await conn.getSignatureStatuses([altSig]);
      if (status.value[0]?.confirmationStatus === 'confirmed' || status.value[0]?.confirmationStatus === 'finalized') break;
      await new Promise(r => setTimeout(r, 500));
    }

    // Wait for ALT to activate (~800ms)
    await new Promise(r => setTimeout(r, 800));

    // Load both ALTs
    const [programAlt, proofAlt, bh] = await Promise.all([
      conn.getAddressLookupTable(PROGRAM_ALT),
      conn.getAddressLookupTable(proofAltAddress),
      conn.getLatestBlockhash('confirmed'),
    ]);

    const alts = [programAlt.value, proofAlt.value].filter((a): a is NonNullable<typeof a> => a != null);
    const cuIx = ComputeBudgetProgram.setComputeUnitLimit({ units: 400000 });

    // Tensor applies the buyer-side broker fee through `takerBroker`; do not append
    // a second transfer here or the buyer is charged twice.
    const platformFeeAmount = feeApplied
      ? calculateExternalMarketplaceFeeAmount(Number(listState.data.amount))
      : 0;

    const msg = new TransactionMessage({
      payerKey: buyerPk,
      recentBlockhash: bh.blockhash,
      instructions: [cuIx, v1Ix],
    }).compileToV0Message(alts);

    const tx = new VersionedTransaction(msg);
    const size = tx.serialize().length;
    const platformFee = platformFeeAmount / 10 ** decimals;
    console.log(`[tensor-buy] tx size: ${size} bytes (proof nodes: ${proofFields.proof.length}, proof ALT: ${proofAltAddress.toBase58()}, currency: ${listingCurrency}, platformFee: ${platformFee.toFixed(6)} ${listingCurrency}, feeApplied: ${feeApplied})`);

    const txBase64 = Buffer.from(tx.serialize()).toString('base64');

    return NextResponse.json({
      tx: txBase64,
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
