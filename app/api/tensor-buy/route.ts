import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    const { mint, buyer } = await request.json();
    if (!mint || !buyer) return NextResponse.json({ error: 'Missing mint or buyer' }, { status: 400 });

    const HELIUS_RPC = `https://mainnet.helius-rpc.com/?api-key=${process.env.HELIUS_API_KEY}`;
    const USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';

    // Dynamic imports for Tensor SDK (uses @solana/web3.js v2 internally)
    const { getBuySplCompressedInstructionAsync, fetchListState, findListStatePda } = await import('@tensor-foundation/marketplace');
    const { retrieveAssetFields, retrieveProofFields, getCNFTArgs } = await import('@tensor-foundation/common-helpers');
    const { createSolanaRpc, address } = await import('@solana/kit');

    const rpc = createSolanaRpc(HELIUS_RPC) as any;

    const buyerAddress = address(buyer);
    const fakeSigner = { address: buyerAddress, signTransactions: async () => [] };

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
    const creatorAddresses = (cnftArgs.creators ?? []).map((c: any) => c[0]);
    const trimmedProof = proofFields.proof.map((p: string) => address(p));

    const price = Number(listState.data.amount) / 1e6;
    const maxAmount = BigInt(listState.data.amount) * BigInt(105) / BigInt(100);

    const buyIx = await (getBuySplCompressedInstructionAsync as any)({
      merkleTree: cnftArgs.merkleTree,
      listState: listStatePda,
      payer: fakeSigner,
      buyer: fakeSigner,
      owner: listState.data.owner,
      rentDestination: rentDest,
      currency: address(USDC_MINT),
      makerBroker,
      takerBroker: address('6drXw31FjHch4ixXa4ngTyUD2cySUs3mpcB2YYGA9g7P'),
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
      canopyDepth: 0,
    });

    const {
      PublicKey, TransactionMessage, VersionedTransaction, TransactionInstruction,
      ComputeBudgetProgram, Connection: SolConnection,
      AddressLookupTableProgram, Transaction, Keypair,
    } = await import('@solana/web3.js');

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

    // Phygitals' program ALT (59 addresses covering all Tensor/Bubblegum/compression programs)
    const PROGRAM_ALT = new PublicKey('4NYENhRXdSq1ek7mvJyzMUvdn2aN3JeAr6huzfL7869j');

    // Create a per-tx proof ALT with this card's proof nodes
    // This is how Phygitals handles tx size — compress proof nodes via a fresh ALT
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

    // Create + extend in one tx
    const { blockhash: altBh } = await conn.getLatestBlockhash('confirmed');
    const altTx = new Transaction().add(createIx).add(extendIx);
    altTx.recentBlockhash = altBh;
    altTx.feePayer = authority.publicKey;
    altTx.sign(authority);
    const altSig = await conn.sendRawTransaction(altTx.serialize(), { skipPreflight: true });
    await conn.confirmTransaction(altSig, 'confirmed');

    // Wait 2 slots for ALT to activate (~800ms)
    await new Promise(r => setTimeout(r, 800));

    // Load both ALTs
    const [programAlt, proofAlt, bh] = await Promise.all([
      conn.getAddressLookupTable(PROGRAM_ALT),
      conn.getAddressLookupTable(proofAltAddress),
      conn.getLatestBlockhash('confirmed'),
    ]);

    const alts = [programAlt.value, proofAlt.value].filter((a): a is NonNullable<typeof a> => a != null);
    const cuIx = ComputeBudgetProgram.setComputeUnitLimit({ units: 400000 });
    const msg = new TransactionMessage({
      payerKey: buyerPk,
      recentBlockhash: bh.blockhash,
      instructions: [cuIx, v1Ix],
    }).compileToV0Message(alts);

    const tx = new VersionedTransaction(msg);
    const size = tx.serialize().length;
    console.log(`[tensor-buy] tx size: ${size} bytes (proof nodes: ${proofFields.proof.length}, proof ALT: ${proofAltAddress.toBase58()})`);

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
    if (msg.includes('Account not found') || msg.includes('3230000')) {
      return NextResponse.json({ error: 'This listing is no longer available. It may have been sold or delisted.' }, { status: 404 });
    }
    return NextResponse.json({ error: msg || 'Failed to build Tensor buy tx' }, { status: 500 });
  }
}

export const maxDuration = 60;
