import { NextRequest, NextResponse } from 'next/server';

import {
  createBase64VersionedTransaction,
  createTensorPseudoSigner,
  ensureHeliusRpcUrl,
  parseTensorBuildRequest,
  reinterpret,
  waitForWeb3Confirmation,
  type TensorBuildRequestBody,
  type TensorInstructionLike,
} from '@/app/api/_lib/list-route-utils';

interface TensorCompressedInstructionInput {
  amount: bigint;
  canopyDepth: number;
  creatorHash: Uint8Array;
  currency?: string;
  dataHash: Uint8Array;
  index: number;
  listState: string;
  merkleTree: string;
  owner: ReturnType<typeof createTensorPseudoSigner>;
  proof: string[];
  rentPayer: ReturnType<typeof createTensorPseudoSigner>;
  root: Uint8Array;
}

export async function POST(request: NextRequest) {
  try {
    const { amount, currency, mint, owner } = parseTensorBuildRequest(
      (await request.json()) as Partial<TensorBuildRequestBody>
    );

    const heliusRpc = ensureHeliusRpcUrl();
    const USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';

    // Dynamic imports for Tensor SDK (uses @solana/web3.js v2 internally)
    const marketplace = await import('@tensor-foundation/marketplace');
    const { findListStatePda } = marketplace;
    const getListCompressedInstructionAsync = reinterpret<
      (input: TensorCompressedInstructionInput) => Promise<TensorInstructionLike>,
      typeof marketplace.getListCompressedInstructionAsync
    >(marketplace.getListCompressedInstructionAsync);
    const commonHelpers = await import('@tensor-foundation/common-helpers');
    const { retrieveAssetFields, retrieveProofFields } = commonHelpers;
    const getCNFTArgs = reinterpret<(
      rpc: ReturnType<typeof createSolanaRpc>,
      mintAddress: string,
      assetFields: Awaited<ReturnType<typeof retrieveAssetFields>>,
      proofFields: Awaited<ReturnType<typeof retrieveProofFields>>
    ) => Promise<{
      creatorHash: Uint8Array;
      dataHash: Uint8Array;
      index: number;
      merkleTree: string;
      root: Uint8Array;
    }>, typeof commonHelpers.getCNFTArgs>(commonHelpers.getCNFTArgs);
    const { createSolanaRpc, address } = await import('@solana/kit');

    const rpc = reinterpret<Parameters<typeof getCNFTArgs>[0], ReturnType<typeof createSolanaRpc>>(
      createSolanaRpc(heliusRpc)
    );

    const fakeSigner = createTensorPseudoSigner(owner);

    const [assetFields, proofFields] = await Promise.all([
      retrieveAssetFields(heliusRpc, mint),
      retrieveProofFields(heliusRpc, mint),
    ]);

    const cnftArgs = await getCNFTArgs(rpc, mint, assetFields, proofFields);
    const [listStatePda] = await findListStatePda({
      mint: reinterpret<Parameters<typeof findListStatePda>[0]["mint"], ReturnType<typeof address>>(
        address(mint)
      ),
    });

    const trimmedProof = proofFields.proof.map((p: string) => address(p));

    const listIx = await getListCompressedInstructionAsync({
      merkleTree: cnftArgs.merkleTree,
      listState: listStatePda,
      owner: fakeSigner,
      rentPayer: fakeSigner,
      index: cnftArgs.index,
      root: cnftArgs.root,
      dataHash: cnftArgs.dataHash,
      creatorHash: cnftArgs.creatorHash,
      amount: BigInt(amount),
      currency: currency === 'USDC' ? address(USDC_MINT) : undefined,
      proof: trimmedProof,
      canopyDepth: 0,
    });

    const { PublicKey, Connection: SolConnection, AddressLookupTableProgram, Transaction, Keypair } = await import('@solana/web3.js');

    const conn = new SolConnection(heliusRpc, 'confirmed');
    const ownerPk = new PublicKey(owner);

    // Phygitals' program ALT (covers all Tensor/Bubblegum/compression programs)
    const PROGRAM_ALT = new PublicKey('4NYENhRXdSq1ek7mvJyzMUvdn2aN3JeAr6huzfL7869j');

    // Create a per-tx proof ALT with this card's proof nodes
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

    // Create + extend ALT in one tx
    const { blockhash: altBh } = await conn.getLatestBlockhash('confirmed');
    const altTx = new Transaction().add(createIx).add(extendIx);
    altTx.recentBlockhash = altBh;
    altTx.feePayer = authority.publicKey;
    altTx.sign(authority);
    const altSig = await conn.sendRawTransaction(altTx.serialize(), { skipPreflight: true });

    await waitForWeb3Confirmation(conn, altSig);

    // Wait for ALT to activate (~800ms)
    await new Promise(r => setTimeout(r, 800));

    // Load both ALTs
    const [programAlt, proofAlt, bh] = await Promise.all([
      conn.getAddressLookupTable(PROGRAM_ALT),
      conn.getAddressLookupTable(proofAltAddress),
      conn.getLatestBlockhash('confirmed'),
    ]);

    const alts = [programAlt.value, proofAlt.value].filter((value): value is NonNullable<typeof value> => value !== null);
    const tx = await createBase64VersionedTransaction({
      connection: {
        ...conn,
        getLatestBlockhash: async () => bh,
      } as typeof conn,
      instruction: listIx,
      lookupTables: alts,
      payer: ownerPk.toBase58(),
    });
    const size = Buffer.from(tx, 'base64').length;
    console.log(`[tensor-list] tx size: ${size} bytes (proof nodes: ${proofFields.proof.length}, proof ALT: ${proofAltAddress.toBase58()})`);

    return NextResponse.json({
      tx,
      mint,
    });

  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to build Tensor list tx';
    console.error('[tensor-list] Error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export const maxDuration = 60;
