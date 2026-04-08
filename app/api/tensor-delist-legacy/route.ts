import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    const { mint, owner } = await request.json();
    if (!mint || !owner) {
      return NextResponse.json({ error: 'Missing mint or owner' }, { status: 400 });
    }

    const HELIUS_RPC = `https://mainnet.helius-rpc.com/?api-key=${process.env.HELIUS_API_KEY}`;

    const { getDelistLegacyInstructionAsync, findListStatePda } = await import('@tensor-foundation/marketplace');
    const { address } = await import('@solana/kit');

    const ownerAddress = address(owner);
    const fakeSigner = { address: ownerAddress, signTransactions: async () => [] };

    const delistIx = await (getDelistLegacyInstructionAsync as any)({
      owner: fakeSigner,
      mint: address(mint),
      rentDestination: ownerAddress,
    });

    const {
      PublicKey, TransactionMessage, VersionedTransaction, TransactionInstruction,
      ComputeBudgetProgram, Connection: SolConnection,
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

    const bh = await conn.getLatestBlockhash('confirmed');
    const cuIx = ComputeBudgetProgram.setComputeUnitLimit({ units: 400000 });
    const msg = new TransactionMessage({
      payerKey: ownerPk,
      recentBlockhash: bh.blockhash,
      instructions: [cuIx, v1Ix],
    }).compileToV0Message();

    const tx = new VersionedTransaction(msg);
    console.log(`[tensor-delist-legacy] tx size: ${tx.serialize().length} bytes, mint: ${mint}`);

    return NextResponse.json({
      tx: Buffer.from(tx.serialize()).toString('base64'),
      mint,
    });

  } catch (err: any) {
    console.error('[tensor-delist-legacy] Error:', err);
    return NextResponse.json({ error: err.message || 'Failed to build delist tx' }, { status: 500 });
  }
}

export const maxDuration = 30;
