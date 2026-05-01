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
import {
  LOOKUP_TABLE_ACTIVATION_DELAY_MS,
  MAX_LOOKUP_TABLE_EXTEND_ADDRESSES,
  MAX_SOLANA_TRANSACTION_BYTES,
  isUint8EncodingOverrun,
  planLookupTableSetupBatchSizes,
} from '@/app/api/tensor-buy/_lib/serialization';

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

    const {
      PublicKey,
      Connection: SolConnection,
      AddressLookupTableProgram,
      Transaction,
      Keypair,
    } = await import('@solana/web3.js');

    const conn = new SolConnection(heliusRpc, 'confirmed');
    const ownerPk = new PublicKey(owner);

    // Phygitals' program ALT (covers all Tensor/Bubblegum/compression programs)
    const PROGRAM_ALT = new PublicKey('4NYENhRXdSq1ek7mvJyzMUvdn2aN3JeAr6huzfL7869j');
    const proofAddresses = proofFields.proof.map((p: string) => new PublicKey(p));
    const maybeBuildCompressedListTransaction = async (
      lookupTables: NonNullable<Awaited<ReturnType<typeof conn.getAddressLookupTable>>['value']>[],
      blockhashOverride: Awaited<ReturnType<typeof conn.getLatestBlockhash>>,
    ) => {
      try {
        const txBase64 = await createBase64VersionedTransaction({
          connection: {
            ...conn,
            getLatestBlockhash: async () => blockhashOverride,
          } as typeof conn,
          instruction: listIx,
          lookupTables,
          payer: ownerPk.toBase58(),
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
    const baseLookupTables = [programAlt.value].filter(
      (value): value is NonNullable<typeof value> => value !== null,
    );

    let txBuild = await maybeBuildCompressedListTransaction(baseLookupTables, initialBlockhash);
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
        fitsWithinLimit: async (batchSize, includeCreateInstruction, currentOffset) => {
          const batchAddresses = proofAddresses.slice(currentOffset, currentOffset + batchSize);
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
        const batchAddresses = proofAddresses.slice(nextOffset, nextOffset + batchSize);
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

      txBuild = await maybeBuildCompressedListTransaction([...baseLookupTables, proofAlt.value], finalBlockhash);
    }

    if (!txBuild || txBuild.txSize > MAX_SOLANA_TRANSACTION_BYTES) {
      throw new Error('Tensor compressed list transaction exceeds Solana size limits');
    }

    console.log(
      `[tensor-list] tx size: ${txBuild.txSize} bytes (proof nodes: ${proofFields.proof.length}, proof ALT: ${proofAltAddress?.toBase58() ?? 'none'})`,
    );

    return NextResponse.json({
      tx: txBuild.txBase64,
      mint,
    });

  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to build Tensor list tx';
    console.error('[tensor-list] Error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export const maxDuration = 60;
