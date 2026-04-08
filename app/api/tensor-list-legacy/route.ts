import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    const { mint, owner, amount, currency } = await request.json();
    if (!mint || !owner || !amount) {
      return NextResponse.json({ error: 'Missing mint, owner, or amount' }, { status: 400 });
    }

    const HELIUS_RPC = `https://mainnet.helius-rpc.com/?api-key=${process.env.HELIUS_API_KEY}`;
    const USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';

    const { getListLegacyInstructionAsync, findListStatePda } = await import('@tensor-foundation/marketplace');
    const { address } = await import('@solana/kit');

    const ownerAddress = address(owner);
    const fakeSigner = { address: ownerAddress, signTransactions: async () => [] };

    const listIx = await (getListLegacyInstructionAsync as any)({
      owner: fakeSigner,
      mint: address(mint),
      amount: BigInt(amount),
      currency: currency === 'USDC' ? address(USDC_MINT) : undefined,
    });

    const {
      PublicKey, TransactionMessage, VersionedTransaction, TransactionInstruction,
      ComputeBudgetProgram, Connection: SolConnection,
    } = await import('@solana/web3.js');

    const conn = new SolConnection(HELIUS_RPC, 'confirmed');
    const ownerPk = new PublicKey(owner);

    const v1Keys = listIx.accounts.map((acct: any) => {
      const addr = typeof acct.address === 'object' && acct.address.address
        ? acct.address.address : String(acct.address);
      return {
        pubkey: new PublicKey(addr),
        isSigner: acct.role >= 2,
        isWritable: acct.role === 1 || acct.role === 3,
      };
    });

    const v1Ix = new TransactionInstruction({
      programId: new PublicKey(listIx.programAddress),
      keys: v1Keys,
      data: Buffer.from(listIx.data),
    });

    const bh = await conn.getLatestBlockhash('confirmed');
    const cuIx = ComputeBudgetProgram.setComputeUnitLimit({ units: 400000 });
    const msg = new TransactionMessage({
      payerKey: ownerPk,
      recentBlockhash: bh.blockhash,
      instructions: [cuIx, v1Ix],
    }).compileToV0Message();

    const tx = new VersionedTransaction(msg);
    console.log(`[tensor-list-legacy] tx size: ${tx.serialize().length} bytes, mint: ${mint}`);

    return NextResponse.json({
      tx: Buffer.from(tx.serialize()).toString('base64'),
      mint,
    });

  } catch (err: any) {
    console.error('[tensor-list-legacy] Error:', err);
    return NextResponse.json({ error: err.message || 'Failed to build Tensor list tx' }, { status: 500 });
  }
}

export const maxDuration = 30;
