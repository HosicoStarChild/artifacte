import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    const { mint, owner } = await request.json();
    if (!mint || !owner) {
      return NextResponse.json({ error: 'Missing mint or owner' }, { status: 400 });
    }

    const HELIUS_RPC = `https://mainnet.helius-rpc.com/?api-key=${process.env.HELIUS_API_KEY}`;
    const TOKEN_METADATA_PROGRAM_ID = 'metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s';

    const { getDelistLegacyInstructionAsync, findListStatePda } = await import('@tensor-foundation/marketplace');
    const { address } = await import('@solana/kit');

    const ownerAddress = address(owner);
    const fakeSigner = { address: ownerAddress, signTransactions: async () => [] };

    // Read on-chain metadata account to detect pNFT + extract authorization rules
    const { PublicKey: PK, Connection: SolConn } = await import('@solana/web3.js');
    const tmpConn = new SolConn(HELIUS_RPC, 'confirmed');
    const mintPk = new PK(mint);
    const metaProgramPk = new PK(TOKEN_METADATA_PROGRAM_ID);
    const [metaPda] = PK.findProgramAddressSync(
      [Buffer.from('metadata'), metaProgramPk.toBuffer(), mintPk.toBuffer()],
      metaProgramPk,
    );
    const metaAccount = await tmpConn.getAccountInfo(metaPda);
    let isPnft = false;
    let ruleSet: string | null = null;

    if (metaAccount?.data) {
      const d = metaAccount.data;
      let o = 1 + 32 + 32;
      o += 4 + 32; o += 4 + 10; o += 4 + 200; o += 2;
      const hasCreators = d[o]; o += 1;
      if (hasCreators === 1) { const n = d.readUInt32LE(o); o += 4; o += n * 34; }
      o += 1; o += 1;
      const hasEdNonce = d[o]; o += 1; if (hasEdNonce === 1) o += 1;
      const hasTokenStd = d[o]; o += 1;
      let tokenStandard = -1;
      if (hasTokenStd === 1) { tokenStandard = d[o]; o += 1; }
      isPnft = tokenStandard === 4;
      const hasColl = d[o]; o += 1; if (hasColl === 1) o += 33;
      const hasUses = d[o]; o += 1; if (hasUses === 1) o += 17;
      const hasCollDetails = d[o]; o += 1;
      if (hasCollDetails === 1) { const v = d[o]; o += 1; if (v === 0) o += 8; else if (v === 1) o += 16; }
      if (o < d.length && d[o] === 1) {
        o += 1; o += 1;
        if (d[o] === 1) { o += 1; ruleSet = new PK(d.slice(o, o + 32)).toBase58(); }
      }
      console.log(`[tensor-delist-legacy] tokenStandard=${tokenStandard} isPnft=${isPnft} ruleSet=${ruleSet}`);
    }

    const delistInput: any = {
      owner: fakeSigner,
      mint: address(mint),
      rentDestination: ownerAddress,
    };

    if (isPnft && ruleSet) {
      delistInput.authorizationRules = address(ruleSet);
      console.log(`[tensor-delist-legacy] pNFT with rule set: ${ruleSet}`);
    }
    if (!isPnft) {
      delistInput.tokenStandard = 0;
    }

    const delistIx = await (getDelistLegacyInstructionAsync as any)(delistInput);

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
