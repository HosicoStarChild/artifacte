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

    // Fetch and decode list state
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
    
    // Parse list state manually (matches SDK decode)
    // Offsets from decoded data:
    // 0-7: discriminator, 8: version, 9: bump
    // 10-41: owner (32 bytes)
    // 42-73: assetId (32 bytes)  
    // 74-81: amount (u64)
    // 82: currency option tag, 83-114: currency pubkey (if Some)
    const bump = listData[9];
    const owner = new PublicKey(listData.slice(10, 42));
    const assetId = new PublicKey(listData.slice(42, 74));
    const amount = listData.readBigUInt64LE(74);
    const hasCurrency = listData[82] === 1;
    const currency = hasCurrency ? new PublicKey(listData.slice(83, 115)) : null;
    
    // Check for maker broker (offset varies based on other optional fields)
    // After currency (82 + 1 + 32 = 115): expiry (i64, 8 bytes) = 115-122
    // privateTaker option (123): tag + 32 if Some = 123 or 124-155
    // makerBroker option: after privateTaker
    const privateTakerTag = listData[123];
    const makerBrokerOffset = privateTakerTag === 1 ? 156 : 124;
    const hasMakerBroker = listData[makerBrokerOffset] === 1;
    const makerBroker = hasMakerBroker ? new PublicKey(listData.slice(makerBrokerOffset + 1, makerBrokerOffset + 33)) : null;

    // rentPayer is after makerBroker
    const rentPayerOffset = hasMakerBroker ? makerBrokerOffset + 33 : makerBrokerOffset + 1;
    const rentPayer = new PublicKey(listData.slice(rentPayerOffset, rentPayerOffset + 32));

    console.log('[tensor-buy] Listing:', {
      owner: owner.toBase58(),
      assetId: assetId.toBase58(),
      amount: amount.toString(),
      currency: currency?.toBase58(),
      makerBroker: makerBroker?.toBase58(),
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
    let offset = 0;
    BUY_SPL_COMPRESSED_DISC.copy(ixData, offset); offset += 8;
    ixData.writeBigUInt64LE(maxAmount, offset); offset += 8;
    // optionalRoyaltyPct = Some(100) = 100% of royalty
    ixData.writeUInt8(1, offset); offset += 1; // Some
    ixData.writeUInt16LE(10000, offset); offset += 2; // 100% = 10000 bps
    Buffer.from(root, 'base64').copy(ixData, offset); offset += 32;
    dataHashBytes.copy(ixData, offset); offset += 32;
    creatorHashBytes.copy(ixData, offset); offset += 32;
    ixData.writeBigUInt64LE(BigInt(nonce), offset); offset += 8;
    ixData.writeUInt32LE(nonce, offset); offset += 4;

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
