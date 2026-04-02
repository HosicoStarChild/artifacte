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
    
    // Program-only ALT: compresses fixed Tensor program addresses (saves ~200 bytes).
    // Proof nodes stay as static accounts — Solflare can simulate static accounts cleanly.
    // This fixes simulation failures caused by ALT-indexed proof nodes on unverified domains.
    const PROGRAM_ALT = new PublicKey('B9zD5xH85HSCU5Lc8WAfPn4S3UWDevhch4efEqjYK2yx');
    const [altAccount, bh] = await Promise.all([
      conn.getAddressLookupTable(PROGRAM_ALT),
      conn.getLatestBlockhash('confirmed'),
    ]);
    const cuIx = ComputeBudgetProgram.setComputeUnitLimit({ units: 400000 });
    const msg = new TransactionMessage({
      payerKey: buyerPk,
      recentBlockhash: bh.blockhash,
      instructions: [cuIx, v1Ix],
    }).compileToV0Message(altAccount.value ? [altAccount.value] : []);
    
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
    const msg = err.message || '';
    // Account not found = listing no longer exists (delisted/sold)
    if (msg.includes('Account not found') || msg.includes('3230000')) {
      return NextResponse.json({ error: 'This listing is no longer available. It may have been sold or delisted.' }, { status: 404 });
    }
    return NextResponse.json({ error: msg || 'Failed to build Tensor buy tx' }, { status: 500 });
  }
}

export const maxDuration = 30;
