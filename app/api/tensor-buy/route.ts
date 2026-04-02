import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    const { mint, buyer } = await request.json();
    if (!mint || !buyer) return NextResponse.json({ error: 'Missing mint or buyer' }, { status: 400 });

    const HELIUS_RPC = `https://mainnet.helius-rpc.com/?api-key=${process.env.HELIUS_API_KEY}`;
    const USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';

    // Dynamic imports for Tensor SDK (uses @solana/web3.js v2 internally)
    const { getBuySplCompressedInstructionAsync, fetchListState, findListStatePda } = await import('@tensor-foundation/marketplace');
    const { getMetaHash, getCanopyDepth, retrieveAssetFields, retrieveProofFields, getCNFTArgs } = await import('@tensor-foundation/common-helpers');
    const { createSolanaRpc, address } = await import('@solana/kit');

    const rpc = createSolanaRpc(HELIUS_RPC) as any;

    // Create a fake signer (buyer will sign on frontend)
    const buyerAddress = address(buyer);
    const fakeSigner = { address: buyerAddress, signTransactions: async () => [] };

    // Fetch asset data, proof, list state in parallel
    const [assetFields, proofFields] = await Promise.all([
      retrieveAssetFields(HELIUS_RPC, mint),
      retrieveProofFields(HELIUS_RPC, mint),
    ]);

    const cnftArgs = await getCNFTArgs(rpc, mint, assetFields, proofFields);
    const [listStatePda] = await findListStatePda({ mint: address(mint) });
    const listState = await fetchListState(rpc, listStatePda);

    const makerBroker = listState.data.makerBroker?.__option === 'Some'
      ? listState.data.makerBroker.value : undefined;
    const rentDest = listState.data.rentPayer || listState.data.owner;
    const creatorAddresses = (cnftArgs.creators ?? []).map((c: any) => c[0]); // Just Address, not [addr, share]
    // Use ALL proof nodes — canopy is stale on-chain, need full proof
    const trimmedProof = proofFields.proof.map((p: string) => address(p));
    const canopyDepth = 0;

    const price = Number(listState.data.amount) / 1e6;
    const maxAmount = BigInt(listState.data.amount) * BigInt(105) / BigInt(100);

    // Build instruction using Tensor SDK (cast to any to avoid v1/v2 type conflicts)
    const buyIx = await (getBuySplCompressedInstructionAsync as any)({
      merkleTree: cnftArgs.merkleTree,
      listState: listStatePda,
      payer: fakeSigner,
      buyer: fakeSigner,
      owner: listState.data.owner,
      rentDestination: rentDest,
      currency: address(USDC_MINT),
      makerBroker,
      takerBroker: address('6drXw31FjHch4ixXa4ngTyUD2cySUs3mpcB2YYGA9g7P'), // platform fee recipient
      index: cnftArgs.index,
      root: cnftArgs.root,
      metaHash: cnftArgs.metaHash,
      creatorShares: cnftArgs.creatorShares,
      creatorVerified: cnftArgs.creatorVerified,
      sellerFeeBasisPoints: cnftArgs.sellerFeeBasisPoints,
      maxAmount,
      optionalRoyaltyPct: 100,
      creators: creatorAddresses,
      proof: trimmedProof,
      canopyDepth: canopyDepth,
    });

    // Build the full unsigned transaction server-side (server web3.js compiles correctly with ALT)
    const { PublicKey, TransactionMessage, VersionedTransaction, TransactionInstruction, ComputeBudgetProgram, Connection: SolConnection } = await import('@solana/web3.js');
    
    const conn = new SolConnection(HELIUS_RPC, 'confirmed');
    const buyerPk = new PublicKey(buyer);
    
    const v1Keys = buyIx.accounts.map((acct: any) => {
      const addr = typeof acct.address === 'object' && acct.address.address
        ? acct.address.address : String(acct.address);
      return {
        pubkey: new PublicKey(addr),
        isSigner: acct.role >= 2,
        isWritable: acct.role === 1 || acct.role === 3,
      };
    });
    
    const v1Ix = new TransactionInstruction({
      programId: new PublicKey(buyIx.programAddress),
      keys: v1Keys,
      data: Buffer.from(buyIx.data),
    });
    
    // Load all ALTs for compression (ALT #1 + #2 + #3 cover proof nodes)
    const ALT_KEY_1 = new PublicKey('4jyK7BDF6NQA87R5NFDyMHNkHuQQNa5uYreGZ7kpYaCN');
    const ALT_KEY_2 = new PublicKey('2tk5qN1U7kY6SJAcL5dngCV4xEUz7McVWygXQzBUEbMo');
    const ALT_KEY_3 = new PublicKey('E7ug9cuR8sshu4UNJkSrw7ukSJC4QMry6WVLZZ1e3mJp');
    const [altAccount1, altAccount2, altAccount3, bh] = await Promise.all([
      conn.getAddressLookupTable(ALT_KEY_1),
      conn.getAddressLookupTable(ALT_KEY_2),
      conn.getAddressLookupTable(ALT_KEY_3),
      conn.getLatestBlockhash('confirmed'),
    ]);

    // Auto-extend ALT #3 with any missing proof nodes (tree grows over time)
    const existingAddrs = new Set([
      ...(altAccount1.value?.state.addresses || []),
      ...(altAccount2.value?.state.addresses || []),
      ...(altAccount3.value?.state.addresses || []),
    ].map((a: any) => a.toBase58()));
    const missingNodes = proofFields.proof.filter((p: string) => !existingAddrs.has(p));
    if (missingNodes.length > 0) {
      console.log(`[tensor-buy] Auto-extending ALT #3 with ${missingNodes.length} missing proof nodes`);
      const { AddressLookupTableProgram, Transaction, Keypair } = await import('@solana/web3.js');
      const authoritySecret = JSON.parse(process.env.SOLANA_AUTHORITY_SECRET || '[]');
      if (authoritySecret.length > 0) {
        const authority = Keypair.fromSecretKey(Uint8Array.from(authoritySecret));
        const extendIx = AddressLookupTableProgram.extendLookupTable({
          payer: authority.publicKey,
          authority: authority.publicKey,
          lookupTable: ALT_KEY_3,
          addresses: missingNodes.map((a: string) => new PublicKey(a)),
        });
        const extendTx = new Transaction().add(extendIx);
        extendTx.recentBlockhash = bh.blockhash;
        extendTx.feePayer = authority.publicKey;
        extendTx.sign(authority);
        const sig = await conn.sendRawTransaction(extendTx.serialize());
        await conn.confirmTransaction(sig, 'confirmed');
        // Refresh ALT #3 after extension
        const refreshed = await conn.getAddressLookupTable(ALT_KEY_3);
        if (refreshed.value) altAccount3.value = refreshed.value;
        console.log(`[tensor-buy] ALT #3 extended ✅ sig: ${sig.slice(0, 20)}...`);
      }
    }

    const alts = [altAccount1.value, altAccount2.value, altAccount3.value].filter((a): a is NonNullable<typeof a> => a != null);
    const cuIx = ComputeBudgetProgram.setComputeUnitLimit({ units: 400000 });
    const msg = new TransactionMessage({
      payerKey: buyerPk,
      recentBlockhash: bh.blockhash,
      instructions: [cuIx, v1Ix],
    }).compileToV0Message(alts);
    
    const tx = new VersionedTransaction(msg);
    const txBase64 = Buffer.from(tx.serialize()).toString('base64');

    return NextResponse.json({
      tx: txBase64,
      price,
      currency: 'USDC',
      seller: String(listState.data.owner),
      mint,
    });

  } catch (err: any) {
    console.error('[tensor-buy] Error:', err);
    return NextResponse.json({ error: err.message || 'Failed to build Tensor buy tx' }, { status: 500 });
  }
}

export const maxDuration = 30;
