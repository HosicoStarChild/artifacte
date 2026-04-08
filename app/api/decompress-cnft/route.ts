import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    const { mint, owner } = await request.json();
    if (!mint || !owner) {
      return NextResponse.json({ error: 'Missing mint or owner' }, { status: 400 });
    }

    const HELIUS_RPC = `https://mainnet.helius-rpc.com/?api-key=${process.env.HELIUS_API_KEY}`;

    const { createUmi } = await import('@metaplex-foundation/umi-bundle-defaults');
    const { mplBubblegum, getAssetWithProof, findVoucherPda, redeem, decompressV1 } =
      await import('@metaplex-foundation/mpl-bubblegum');
    const { mplToolbox } = await import('@metaplex-foundation/mpl-toolbox');
    const { dasApi } = await import('@metaplex-foundation/digital-asset-standard-api');
    const { publicKey, createNoopSigner } = await import('@metaplex-foundation/umi');

    const umi = createUmi(HELIUS_RPC).use(mplToolbox()).use(mplBubblegum()).use(dasApi());

    const assetWithProof = await getAssetWithProof(umi as any, publicKey(mint));
    const leafOwnerKey = assetWithProof.leafOwner;
    const ownerSigner = createNoopSigner(publicKey(owner));

    // Build redeem instruction (step 1: remove leaf from tree, create voucher)
    const redeemIxs = redeem(umi, {
      ...assetWithProof,
      leafOwner: ownerSigner,
    }).getInstructions();

    // Build decompressV1 instruction (step 2: voucher → regular NFT)
    const voucher = findVoucherPda(umi, assetWithProof);
    const decompressIxs = decompressV1(umi, {
      ...assetWithProof,
      leafOwner: ownerSigner,
      mint: publicKey(mint),
      voucher,
    }).getInstructions();

    // Convert UMI instructions to web3.js v1
    const {
      PublicKey, TransactionMessage, VersionedTransaction, TransactionInstruction,
      ComputeBudgetProgram, Connection: SolConnection, AddressLookupTableProgram,
      Transaction, Keypair,
    } = await import('@solana/web3.js');

    const conn = new SolConnection(HELIUS_RPC, 'confirmed');
    const ownerPk = new PublicKey(owner);

    const toV1Ix = (umiIx: any) => {
      return new TransactionInstruction({
        programId: new PublicKey(umiIx.programId),
        keys: umiIx.keys.map((k: any) => ({
          pubkey: new PublicKey(k.pubkey),
          isSigner: k.isSigner,
          isWritable: k.isWritable,
        })),
        data: Buffer.from(umiIx.data),
      });
    }

    const redeemV1Ix = toV1Ix(redeemIxs[0]);
    const decompressV1Ix = toV1Ix(decompressIxs[0]);

    // Redeem tx may exceed 1232 bytes due to proof nodes.
    // Use the phygitals program ALT + a per-tx proof ALT if needed.
    const PROGRAM_ALT = new PublicKey('4NYENhRXdSq1ek7mvJyzMUvdn2aN3JeAr6huzfL7869j');
    const proofAddresses = (assetWithProof.proof || []).map((p: string) => new PublicKey(p));

    let proofAltAddress: typeof PublicKey.prototype | null = null;
    let setupTxBase64: string | null = null;

    // Build a simple test tx first to check size
    const bh = await conn.getLatestBlockhash('confirmed');
    const cuIx = ComputeBudgetProgram.setComputeUnitLimit({ units: 400_000 });

    const programAlt = await conn.getAddressLookupTable(PROGRAM_ALT);
    const alts = programAlt.value ? [programAlt.value] : [];

    const testMsg = new TransactionMessage({
      payerKey: ownerPk,
      recentBlockhash: bh.blockhash,
      instructions: [cuIx, redeemV1Ix],
    }).compileToV0Message(alts);
    const testSize = new VersionedTransaction(testMsg).serialize().length;

    if (testSize > 1232 && proofAddresses.length > 0) {
      // Need proof ALT
      const authoritySecret = JSON.parse(process.env.SOLANA_AUTHORITY_SECRET || '[]');
      if (authoritySecret.length === 0) {
        throw new Error('SOLANA_AUTHORITY_SECRET not configured');
      }
      const authority = Keypair.fromSecretKey(Uint8Array.from(authoritySecret));

      const slot = await conn.getSlot();
      const [createIx, altAddr] = AddressLookupTableProgram.createLookupTable({
        authority: authority.publicKey,
        payer: authority.publicKey,
        recentSlot: slot - 1,
      });
      proofAltAddress = altAddr;

      const extendIx = AddressLookupTableProgram.extendLookupTable({
        payer: authority.publicKey,
        authority: authority.publicKey,
        lookupTable: altAddr,
        addresses: proofAddresses,
      });

      const altTx = new Transaction().add(createIx).add(extendIx);
      altTx.recentBlockhash = bh.blockhash;
      altTx.feePayer = authority.publicKey;
      altTx.sign(authority);
      const altSig = await conn.sendRawTransaction(altTx.serialize(), { skipPreflight: true });

      for (let i = 0; i < 30; i++) {
        const status = await conn.getSignatureStatuses([altSig]);
        if (status.value[0]?.confirmationStatus === 'confirmed' || status.value[0]?.confirmationStatus === 'finalized') break;
        await new Promise(r => setTimeout(r, 500));
      }
      await new Promise(r => setTimeout(r, 800));
    }

    // Load ALTs for final tx building
    const altAccounts = [programAlt.value].filter((a): a is NonNullable<typeof a> => a != null);
    if (proofAltAddress) {
      const proofAlt = await conn.getAddressLookupTable(proofAltAddress);
      if (proofAlt.value) altAccounts.push(proofAlt.value);
    }

    // Fresh blockhash for user txs
    const bh2 = await conn.getLatestBlockhash('confirmed');

    // Tx 1: Redeem
    const redeemMsg = new TransactionMessage({
      payerKey: ownerPk,
      recentBlockhash: bh2.blockhash,
      instructions: [cuIx, redeemV1Ix],
    }).compileToV0Message(altAccounts);
    const redeemTx = new VersionedTransaction(redeemMsg);

    // Tx 2: Decompress
    const decompressMsg = new TransactionMessage({
      payerKey: ownerPk,
      recentBlockhash: bh2.blockhash,
      instructions: [cuIx, decompressV1Ix],
    }).compileToV0Message(altAccounts);
    const decompressTx = new VersionedTransaction(decompressMsg);

    console.log(`[decompress-cnft] redeem: ${redeemTx.serialize().length}B, decompress: ${decompressTx.serialize().length}B, mint: ${mint}`);

    return NextResponse.json({
      redeemTx: Buffer.from(redeemTx.serialize()).toString('base64'),
      decompressTx: Buffer.from(decompressTx.serialize()).toString('base64'),
      mint,
    });

  } catch (err: any) {
    console.error('[decompress-cnft] Error:', err);
    return NextResponse.json({ error: err.message || 'Failed to build decompress tx' }, { status: 500 });
  }
}

export const maxDuration = 60;
