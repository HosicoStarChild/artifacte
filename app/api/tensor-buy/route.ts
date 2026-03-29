import { NextResponse } from 'next/server';
import { 
  PublicKey, 
  TransactionMessage, 
  VersionedTransaction, 
  TransactionInstruction,
  SystemProgram,
  SYSVAR_RENT_PUBKEY,
} from '@solana/web3.js';
import { 
  getAssociatedTokenAddress, 
  TOKEN_PROGRAM_ID, 
  ASSOCIATED_TOKEN_PROGRAM_ID,
  createAssociatedTokenAccountInstruction,
} from '@solana/spl-token';

const HELIUS_KEY = process.env.HELIUS_API_KEY;
const HELIUS_RPC = `https://mainnet.helius-rpc.com/?api-key=${HELIUS_KEY}`;

// Program IDs
const TENSOR_MARKETPLACE = new PublicKey('TCMPhJdwDryooaGtiocG1u3xcYbRpiJzb283XfCZsDp');
const TENSOR_FEE_PROGRAM = new PublicKey('TFEEgwDP6nn1s8mMX2tTNPPz8j2VomkphLUmyxKm17A');
const BUBBLEGUM = new PublicKey('BGUMAp9Gq7iTEuizy4pqaxsTyUCBK68MDfK752saRPUY');
const SPL_NOOP = new PublicKey('noopb9bkMVfRPU8AsBRBV2dZzAccCQyztmttaRtMZpX');
const SPL_ACCOUNT_COMPRESSION = new PublicKey('cmtDvXumGCrqC1Age74AVPhSRVXJMd8PJS91L8KbNCK');
const USDC_MINT = new PublicKey('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v');

// BuySplCompressed discriminator
const BUY_SPL_COMPRESSED_DISC = Buffer.from('4188feff3b82eaae', 'hex');

export async function POST(request: Request) {
  try {
    const { mint, buyer, listStateAddress } = await request.json();
    
    if (!mint || !buyer) {
      return NextResponse.json({ error: 'Missing mint or buyer' }, { status: 400 });
    }
    if (!HELIUS_KEY) {
      return NextResponse.json({ error: 'HELIUS_API_KEY not configured' }, { status: 500 });
    }

    const buyerPubkey = new PublicKey(buyer);

    // 1. Fetch the Tensor list state account to get listing details
    let listState: PublicKey;
    let listingData: any;

    if (listStateAddress) {
      listState = new PublicKey(listStateAddress);
    } else {
      // Derive list state PDA: seeds = ["list_state", assetId]
      const assetIdPubkey = new PublicKey(mint);
      const [pda] = PublicKey.findProgramAddressSync(
        [Buffer.from('list_state'), assetIdPubkey.toBytes()],
        TENSOR_MARKETPLACE
      );
      listState = pda;
    }

    // Fetch and decode list state using Borsh layout
    const listAcctRes = await fetch(HELIUS_RPC, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0', id: 1,
        method: 'getAccountInfo',
        params: [listState.toBase58(), { encoding: 'base64' }],
      }),
    });
    const listAcct = await listAcctRes.json();
    if (!listAcct.result?.value) {
      return NextResponse.json({ error: 'Listing not found on Tensor' }, { status: 404 });
    }

    const listData = Buffer.from(listAcct.result.value.data[0], 'base64');
    
    // Decode using known Borsh layout from SDK analysis:
    // The SDK's getListStateDecoder() works but requires ESM/web3.js v2
    // Parse with fixed offsets determined from SDK output:
    // Field order: discriminator(8), version(1), bump(1[array]), owner(32), assetId(32), amount(8), 
    //   currency(1+32 option), expiry(8), privateTaker(1+32 option), makerBroker(1+32 option), rentPayer(32), cosigner(?)
    
    // List state is verified to exist — we'll get listing details from ME RPC below
    
    // Find owner by searching for a valid 32-byte pubkey pattern after discriminator
    // Use a different approach: fetch listing info from ME RPC which already has parsed data
    const ME_API_KEY = process.env.ME_API_KEY || '';
    const rpcQ = JSON.stringify({ $match: { tokenMint: mint }, $sort: { 'tapioca.v': 1 }, $skip: 0, $limit: 1 });
    const rpcRes = await fetch(
      `https://api-mainnet.magiceden.dev/rpc/getListedNFTsByQuery?q=${encodeURIComponent(rpcQ)}`,
      { headers: { 'Authorization': `Bearer ${ME_API_KEY}` }, signal: AbortSignal.timeout(10000) }
    );
    
    let owner: PublicKey = PublicKey.default;
    let assetId: PublicKey = new PublicKey(mint);
    let amount: bigint = BigInt(0);
    let currency: PublicKey | null = null;
    let makerBroker: PublicKey | null = null;
    let rentPayer: PublicKey = PublicKey.default;
    
    if (rpcRes.ok) {
      const rpcData = await rpcRes.json();
      const item = rpcData.results?.data?.[0];
      if (item) {
        owner = new PublicKey(item.owner);
        assetId = new PublicKey(item.mintAddress);
        const spl = item.priceInfo?.splPrice || item.splPrice;
        if (spl?.symbol === 'USDC') {
          amount = BigInt(spl.rawAmount);
          currency = USDC_MINT;
        } else {
          amount = BigInt(Math.round(item.price * 1e9)); // SOL lamports
        }
      } else {
        return NextResponse.json({ error: 'Listing not found' }, { status: 404 });
      }
    } else {
      return NextResponse.json({ error: 'Failed to fetch listing data' }, { status: 502 });
    }
    
    // Get maker broker and rent payer from the on-chain list state
    // Use a simple scan: after the known fields, look for pubkey-sized data
    // For now, use defaults that work for phygitals
    makerBroker = null; // Will be resolved from account data if needed
    rentPayer = owner; // Default to seller

    console.log('[tensor-buy] Listing:', {
      owner: (owner as PublicKey).toBase58(),
      assetId: (assetId as PublicKey).toBase58(),
      amount: amount.toString(),
      currency: currency?.toBase58(),
    });

    if (!currency || !currency.equals(USDC_MINT)) {
      return NextResponse.json({ error: 'Only USDC listings supported' }, { status: 400 });
    }

    // 2. Get asset proof from Helius (merkle tree data for cNFT)
    const proofRes = await fetch(HELIUS_RPC, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0', id: 1,
        method: 'getAssetProof',
        params: { id: assetId.toBase58() },
      }),
    });
    const proofData = await proofRes.json();
    const proof = proofData.result;
    if (!proof) {
      return NextResponse.json({ error: 'Failed to get asset proof' }, { status: 502 });
    }

    const merkleTree = new PublicKey(proof.tree_id);
    const root = proof.root;
    const dataHash = proof.data_hash || '';
    const creatorHash = proof.creator_hash || '';
    const nonce = proof.leaf_id;
    const proofPath = proof.proof.map((p: string) => new PublicKey(p));

    // 3. Get asset data for canopy depth
    const assetRes = await fetch(HELIUS_RPC, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0', id: 1,
        method: 'getAsset',
        params: { id: assetId.toBase58() },
      }),
    });
    const assetData = await assetRes.json();
    const asset = assetData.result;
    
    // Creators for royalty
    const creators = asset?.creators || [];

    // 4. Derive all required accounts
    const [treeAuthority] = PublicKey.findProgramAddressSync(
      [merkleTree.toBytes()],
      BUBBLEGUM
    );

    // Fee vault PDA (from Tensor fee program)
    const feeVaultAddress = listState; // Fee vault is derived from the list state
    const [feeVault] = PublicKey.findProgramAddressSync(
      [listState.toBytes().slice(-1)],
      TENSOR_FEE_PROGRAM
    );

    // Token accounts
    const buyerUsdcAta = await getAssociatedTokenAddress(USDC_MINT, buyerPubkey);
    const ownerUsdcAta = await getAssociatedTokenAddress(USDC_MINT, owner);
    const feeVaultUsdcAta = await getAssociatedTokenAddress(USDC_MINT, feeVault, true);
    
    // Taker/maker broker ATAs
    const takerBroker = buyerPubkey; // No taker broker
    const takerBrokerAta = buyerUsdcAta;
    const makerBrokerAta = makerBroker ? await getAssociatedTokenAddress(USDC_MINT, makerBroker, true) : buyerUsdcAta;

    // 5. Build the instruction data
    // BuySplCompressed data: discriminator (8) + maxAmount (u64) + optionalRoyaltyPct (option<u16>) + root (32) + dataHash (32) + creatorHash (32) + nonce (u64) + index (u32)
    const maxAmount = amount + (amount * BigInt(5) / BigInt(100)); // 5% slippage
    const dataHashBytes = Buffer.from(dataHash, 'base64');
    const creatorHashBytes = Buffer.from(creatorHash, 'base64');
    
    const ixData = Buffer.alloc(8 + 8 + 3 + 32 + 32 + 32 + 8 + 4);
    let ixOffset = 0;
    BUY_SPL_COMPRESSED_DISC.copy(ixData, ixOffset); ixOffset += 8;
    ixData.writeBigUInt64LE(maxAmount, ixOffset); ixOffset += 8;
    // optionalRoyaltyPct = Some(100) = 100% of royalty
    ixData.writeUInt8(1, ixOffset); ixOffset += 1; // Some
    ixData.writeUInt16LE(10000, ixOffset); ixOffset += 2; // 100% = 10000 bps
    Buffer.from(root, 'base64').copy(ixData, ixOffset); ixOffset += 32;
    dataHashBytes.copy(ixData, ixOffset); ixOffset += 32;
    creatorHashBytes.copy(ixData, ixOffset); ixOffset += 32;
    ixData.writeBigUInt64LE(BigInt(nonce), ixOffset); ixOffset += 8;
    ixData.writeUInt32LE(nonce, ixOffset); ixOffset += 4;

    // 6. Build account keys
    const keys = [
      { pubkey: feeVault, isSigner: false, isWritable: true },
      { pubkey: feeVaultUsdcAta, isSigner: false, isWritable: true },
      { pubkey: treeAuthority, isSigner: false, isWritable: false },
      { pubkey: merkleTree, isSigner: false, isWritable: true },
      { pubkey: SPL_NOOP, isSigner: false, isWritable: false },
      { pubkey: SPL_ACCOUNT_COMPRESSION, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      { pubkey: BUBBLEGUM, isSigner: false, isWritable: false },
      { pubkey: TENSOR_MARKETPLACE, isSigner: false, isWritable: false },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: ASSOCIATED_TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: listState, isSigner: false, isWritable: true },
      { pubkey: buyerPubkey, isSigner: true, isWritable: false },
      { pubkey: buyerPubkey, isSigner: true, isWritable: true }, // payer
      { pubkey: buyerUsdcAta, isSigner: false, isWritable: true },
      { pubkey: owner, isSigner: false, isWritable: false },
      { pubkey: ownerUsdcAta, isSigner: false, isWritable: true },
      { pubkey: USDC_MINT, isSigner: false, isWritable: false },
      { pubkey: takerBroker, isSigner: false, isWritable: true },
      { pubkey: takerBrokerAta, isSigner: false, isWritable: true },
      { pubkey: makerBroker || buyerPubkey, isSigner: false, isWritable: true },
      { pubkey: makerBrokerAta, isSigner: false, isWritable: true },
      { pubkey: rentPayer, isSigner: false, isWritable: true },
      // Creator accounts for royalty distribution
      ...creators.map((c: any) => ({
        pubkey: new PublicKey(c.address),
        isSigner: false,
        isWritable: true,
      })),
      // Proof path (remaining accounts)
      ...proofPath.map((p: PublicKey) => ({
        pubkey: p,
        isSigner: false,
        isWritable: false,
      })),
    ];

    const instruction = new TransactionInstruction({
      programId: TENSOR_MARKETPLACE,
      keys,
      data: ixData,
    });

    // 7. Build the versioned transaction
    const blockhashRes = await fetch(HELIUS_RPC, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0', id: 1,
        method: 'getLatestBlockhash',
        params: [{ commitment: 'confirmed' }],
      }),
    });
    const blockhashData = await blockhashRes.json();
    const blockhash = blockhashData.result.value.blockhash;

    // Check if buyer has USDC ATA, if not add create instruction
    const instructions: TransactionInstruction[] = [];
    
    const buyerAtaRes = await fetch(HELIUS_RPC, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0', id: 1,
        method: 'getAccountInfo',
        params: [buyerUsdcAta.toBase58()],
      }),
    });
    const buyerAtaData = await buyerAtaRes.json();
    if (!buyerAtaData.result?.value) {
      instructions.push(
        createAssociatedTokenAccountInstruction(
          buyerPubkey, buyerUsdcAta, buyerPubkey, USDC_MINT
        )
      );
    }

    instructions.push(instruction);

    const messageV0 = new TransactionMessage({
      payerKey: buyerPubkey,
      recentBlockhash: blockhash,
      instructions,
    }).compileToV0Message();

    const tx = new VersionedTransaction(messageV0);
    const txBase64 = Buffer.from(tx.serialize()).toString('base64');

    return NextResponse.json({
      tx: txBase64,
      price: Number(amount) / 1e6, // USDC has 6 decimals
      currency: 'USDC',
      seller: owner.toBase58(),
      mint: assetId.toBase58(),
      listState: listState.toBase58(),
    });

  } catch (err: any) {
    console.error('[tensor-buy] Error:', err);
    return NextResponse.json({ error: err.message || 'Failed to build Tensor buy transaction' }, { status: 500 });
  }
}
