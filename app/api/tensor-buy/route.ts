import { NextResponse } from 'next/server';

// Rate limit: 5 requests per minute per IP
const rateMap = new Map<string, { count: number; reset: number }>();
function checkRate(ip: string): boolean {
  const now = Date.now();
  const e = rateMap.get(ip);
  if (!e || now > e.reset) { rateMap.set(ip, { count: 1, reset: now + 60000 }); return true; }
  if (e.count >= 5) return false;
  e.count++;
  return true;
}

export async function POST(request: Request) {
  try {
    const ip = (request as any).headers?.get?.('x-forwarded-for') || 'unknown';
    if (!checkRate(ip)) return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 });

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
      takerBroker: buyerAddress,
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

    // 2% platform fee to treasury (separate tx — buy tx is maxed at 49 accounts)
    const { createTransferCheckedInstruction, getAssociatedTokenAddress } = await import('@solana/spl-token');
    const TREASURY = new PublicKey('6drXw31FjHch4ixXa4ngTyUD2cySUs3mpcB2YYGA9g7P');
    const USDC_PK = new PublicKey(USDC_MINT);
    const feeAmount = BigInt(listState.data.amount) * BigInt(200) / BigInt(10000); // 2%
    const buyerUsdcAta = await getAssociatedTokenAddress(USDC_PK, buyerPk);
    const treasuryUsdcAta = await getAssociatedTokenAddress(USDC_PK, TREASURY);
    const feeIx = createTransferCheckedInstruction(buyerUsdcAta, USDC_PK, treasuryUsdcAta, buyerPk, feeAmount, 6);

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
    
    // Load ALT for compression (45 addresses)
    const ALT_KEY = new PublicKey('4jyK7BDF6NQA87R5NFDyMHNkHuQQNa5uYreGZ7kpYaCN');
    const [altAccount, bh] = await Promise.all([
      conn.getAddressLookupTable(ALT_KEY),
      conn.getLatestBlockhash('confirmed'),
    ]);
    
    const cuIx = ComputeBudgetProgram.setComputeUnitLimit({ units: 400000 });
    
    // Build buy tx — 3 instructions: 2 compute budget + 1 Tensor BuySpl (no fee here, tx is maxed)
    const buyMsg = new TransactionMessage({
      payerKey: buyerPk,
      recentBlockhash: bh.blockhash,
      instructions: [cuIx, v1Ix],
    }).compileToV0Message(altAccount.value ? [altAccount.value] : []);
    const buyTx = new VersionedTransaction(buyMsg);

    // Build separate fee tx (small, no ALT needed)
    const feeMsg = new TransactionMessage({
      payerKey: buyerPk,
      recentBlockhash: bh.blockhash,
      instructions: [feeIx],
    }).compileToV0Message();
    const feeTx = new VersionedTransaction(feeMsg);

    const platformFee = Number(feeAmount) / 1e6;
    return NextResponse.json({
      tx: Buffer.from(buyTx.serialize()).toString('base64'),
      feeTx: Buffer.from(feeTx.serialize()).toString('base64'),
      price,
      platformFee,
      total: price + platformFee,
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
