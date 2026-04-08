import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    const { mint, owner, amount, currency } = await request.json();
    if (!mint || !owner || !amount) {
      return NextResponse.json({ error: 'Missing mint, owner, or amount' }, { status: 400 });
    }

    const HELIUS_RPC = `https://mainnet.helius-rpc.com/?api-key=${process.env.HELIUS_API_KEY}`;
    const USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
    const TOKEN_METADATA_PROGRAM_ID = 'metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s';

    const { getListLegacyInstructionAsync, findListStatePda } = await import('@tensor-foundation/marketplace');
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
      let o = 1 + 32 + 32; // key + update_authority + mint
      o += 4 + 32; // name (borsh string padded to 32)
      o += 4 + 10; // symbol (padded to 10)
      o += 4 + 200; // uri (padded to 200)
      o += 2; // seller_fee_basis_points
      const hasCreators = d[o]; o += 1;
      if (hasCreators === 1) { const n = d.readUInt32LE(o); o += 4; o += n * 34; }
      o += 1; // primary_sale_happened
      o += 1; // is_mutable
      const hasEdNonce = d[o]; o += 1; if (hasEdNonce === 1) o += 1;
      const hasTokenStd = d[o]; o += 1;
      let tokenStandard = -1;
      if (hasTokenStd === 1) { tokenStandard = d[o]; o += 1; }
      isPnft = tokenStandard === 4; // ProgrammableNonFungible
      const hasColl = d[o]; o += 1; if (hasColl === 1) o += 33;
      const hasUses = d[o]; o += 1; if (hasUses === 1) o += 17;
      const hasCollDetails = d[o]; o += 1;
      if (hasCollDetails === 1) { const v = d[o]; o += 1; if (v === 0) o += 8; else if (v === 1) o += 16; }
      if (o < d.length && d[o] === 1) { // programmable_config: Some
        o += 1; // Some marker
        o += 1; // ProgrammableConfig::V1 enum
        if (d[o] === 1) { // rule_set: Some
          o += 1;
          ruleSet = new PK(d.slice(o, o + 32)).toBase58();
        }
      }
      console.log(`[tensor-list-legacy] tokenStandard=${tokenStandard} isPnft=${isPnft} ruleSet=${ruleSet}`);
    }

    const listInput: any = {
      owner: fakeSigner,
      mint: address(mint),
      amount: BigInt(amount),
      currency: currency === 'USDC' ? address(USDC_MINT) : undefined,
    };

    if (isPnft && ruleSet) {
      listInput.authorizationRules = address(ruleSet);
      console.log(`[tensor-list-legacy] pNFT with rule set: ${ruleSet}`);
    }

    if (!isPnft) {
      listInput.tokenStandard = 0; // TokenStandard.NonFungible
      console.log(`[tensor-list-legacy] Standard NFT (non-pNFT)`);
    }

    const listIx = await (getListLegacyInstructionAsync as any)(listInput);

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
