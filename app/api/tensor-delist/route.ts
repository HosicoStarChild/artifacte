import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    const { mint, owner } = await request.json();
    if (!mint || !owner) {
      return NextResponse.json({ error: 'Missing mint or owner' }, { status: 400 });
    }

    const HELIUS_RPC = `https://mainnet.helius-rpc.com/?api-key=${process.env.HELIUS_API_KEY}`;

    const { getDelistCompressedInstructionAsync, findListStatePda } = await import('@tensor-foundation/marketplace');
    const { retrieveAssetFields, retrieveProofFields, getCNFTArgs } = await import('@tensor-foundation/common-helpers');
    const { createSolanaRpc, address } = await import('@solana/kit');

    const rpc = createSolanaRpc(HELIUS_RPC) as any;
    const ownerAddress = address(owner);
    const fakeSigner = { address: ownerAddress, signTransactions: async () => [] };

    const [assetFields, proofFields] = await Promise.all([
      retrieveAssetFields(HELIUS_RPC, mint),
      retrieveProofFields(HELIUS_RPC, mint),
    ]);

    const cnftArgs = await getCNFTArgs(rpc, mint, assetFields, proofFields);
    const [listStatePda] = await findListStatePda({ mint: address(mint) });
    const trimmedProof = proofFields.proof.map((p: string) => address(p));

    const delistIx = await (getDelistCompressedInstructionAsync as any)({
      merkleTree: cnftArgs.merkleTree,
      listState: listStatePda,
      owner: fakeSigner,
      rentDestination: ownerAddress,
      index: cnftArgs.index,
      root: cnftArgs.root,
      dataHash: cnftArgs.dataHash,
      creatorHash: cnftArgs.creatorHash,
      proof: trimmedProof,
      canopyDepth: 0,
    });

    const {
      PublicKey, TransactionMessage, VersionedTransaction, TransactionInstruction,
      ComputeBudgetProgram, Connection: SolConnection,
      AddressLookupTableProgram, Transaction, Keypair,
    } = await import('@solana/web3.js');

    const conn = new SolConnection(HELIUS_RPC, 'confirmed');
    const ownerPk = new PublicKey(owner);

    const v1Keys = delistIx.accounts.map((acct: any) => {
      const addr = typeof acct.address === 'object' && acct.address.address
        ? acct.address.address : String(acct.address);
      return {
        pubkey: new PublicKey(addr),
        isSigner: acct.role >= 2,
        isWritable: acct.role === 1 || acct.role === 3,
      };
    });

    const v1Ix = new TransactionInstruction({
      programId: new PublicKey(delistIx.programAddress),
      keys: v1Keys,
      data: Buffer.from(delistIx.data),
    });

    // Program ALT for Tensor/Bubblegum programs
    const PROGRAM_ALT = new PublicKey('4NYENhRXdSq1ek7mvJyzMUvdn2aN3JeAr6huzfL7869j');

    // Create per-tx proof ALT
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

    const { blockhash: altBh } = await conn.getLatestBlockhash('confirmed');
    const altTx = new Transaction().add(createIx).add(extendIx);
    altTx.recentBlockhash = altBh;
    altTx.feePayer = authority.publicKey;
    altTx.sign(authority);
    const altSig = await conn.sendRawTransaction(altTx.serialize(), { skipPreflight: true });

    // Poll for ALT tx confirmation
    for (let i = 0; i < 30; i++) {
      const status = await conn.getSignatureStatuses([altSig]);
      if (status.value[0]?.confirmationStatus === 'confirmed' || status.value[0]?.confirmationStatus === 'finalized') break;
      await new Promise(r => setTimeout(r, 500));
    }

    await new Promise(r => setTimeout(r, 800));

    const [programAlt, proofAlt, bh] = await Promise.all([
      conn.getAddressLookupTable(PROGRAM_ALT),
      conn.getAddressLookupTable(proofAltAddress),
      conn.getLatestBlockhash('confirmed'),
    ]);

    const alts = [programAlt.value, proofAlt.value].filter((a): a is NonNullable<typeof a> => a != null);
    const cuIx = ComputeBudgetProgram.setComputeUnitLimit({ units: 400000 });
    const msg = new TransactionMessage({
      payerKey: ownerPk,
      recentBlockhash: bh.blockhash,
      instructions: [cuIx, v1Ix],
    }).compileToV0Message(alts);

    const tx = new VersionedTransaction(msg);
    console.log(`[tensor-delist] tx size: ${tx.serialize().length} bytes`);

    return NextResponse.json({
      tx: Buffer.from(tx.serialize()).toString('base64'),
      mint,
    });

  } catch (err: any) {
    console.error('[tensor-delist] Error:', err);
    return NextResponse.json({ error: err.message || 'Failed to build delist tx' }, { status: 500 });
  }
}

export const maxDuration = 60;
