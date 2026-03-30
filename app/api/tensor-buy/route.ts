import { NextResponse } from 'next/server';
import { 
  PublicKey, TransactionMessage, VersionedTransaction, TransactionInstruction, 
  SystemProgram, ComputeBudgetProgram, AddressLookupTableAccount,
} from '@solana/web3.js';
import { 
  getAssociatedTokenAddress, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID,
  createAssociatedTokenAccountInstruction,
} from '@solana/spl-token';

const HELIUS_RPC = `https://mainnet.helius-rpc.com/?api-key=${process.env.HELIUS_API_KEY}`;
const ME_API_KEY = process.env.ME_API_KEY || '';

const TENSOR = new PublicKey('TCMPhJdwDryooaGtiocG1u3xcYbRpiJzb283XfCZsDp');
const BUBBLEGUM = new PublicKey('BGUMAp9Gq7iTEuizy4pqaxsTyUCBK68MDfK752saRPUY');
const NOOP = new PublicKey('noopb9bkMVfRPU8AsbpTUg8AQkHtKwMYZiFUjNRtMmV');
const COMPRESSION = new PublicKey('cmtDvXumGCrqC1Age74AVPhSRVXJMd8PJS91L8KbNCK');
const USDC_MINT = new PublicKey('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v');
const FEE_PROGRAM = new PublicKey('TFEEgwDP6nn1s8mMX2tTNPPz8j2VomkphLUmyxKm17A');
const ALT_ADDRESS = new PublicKey('4jyK7BDF6NQA87R5NFDyMHNkHuQQNa5uYreGZ7kpYaCN');
const BUY_SPL_COMPRESSED_DISC = Buffer.from('4188feff3b82eaae', 'hex');

async function heliusRpc(method: string, params: any) {
  const r = await fetch(HELIUS_RPC, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
    signal: AbortSignal.timeout(12000),
  });
  return (await r.json()).result;
}

export async function POST(request: Request) {
  try {
    const { mint, buyer } = await request.json();
    if (!mint || !buyer) return NextResponse.json({ error: 'Missing mint or buyer' }, { status: 400 });

    const buyerPk = new PublicKey(buyer);
    const assetId = new PublicKey(mint);

    // Derive PDAs
    const [listState] = PublicKey.findProgramAddressSync(
      [Buffer.from('list_state'), assetId.toBytes()], TENSOR
    );

    // Parallel fetch: ME RPC listing + asset proof + asset data + blockhash + ALT
    const meQ = JSON.stringify({ $match: { collectionSymbol: 'phygitals', tokenMint: mint }, $sort: { 'tapioca.v': 1 }, $skip: 0, $limit: 1 });

    const [meRes, proofResult, assetResult, blockhashResult, altResult] = await Promise.all([
      fetch(`https://api-mainnet.magiceden.dev/rpc/getListedNFTsByQuery?q=${encodeURIComponent(meQ)}`, {
        headers: { Authorization: `Bearer ${ME_API_KEY}` }, signal: AbortSignal.timeout(8000),
      }).then(r => r.json()).catch(() => null),
      heliusRpc('getAssetProof', { id: mint }),
      heliusRpc('getAsset', { id: mint }),
      heliusRpc('getLatestBlockhash', [{ commitment: 'confirmed' }]),
      heliusRpc('getAddressLookupTable', [ALT_ADDRESS.toBase58()]),
    ]);

    // Parse listing
    const item = meRes?.results?.data?.[0];
    if (!item) return NextResponse.json({ error: 'Listing not found' }, { status: 404 });

    const owner = new PublicKey(item.owner);
    const spl = item.priceInfo?.splPrice || item.splPrice;
    if (!spl || spl.symbol !== 'USDC') {
      return NextResponse.json({ error: 'Only USDC listings supported' }, { status: 400 });
    }
    const amount = BigInt(spl.rawAmount);
    const maxAmount = amount + (amount * BigInt(5) / BigInt(100));

    // Parse proof & asset
    if (!proofResult) return NextResponse.json({ error: 'Failed to get asset proof' }, { status: 502 });
    const merkleTree = new PublicKey(proofResult.tree_id);
    const proofPath = proofResult.proof.map((p: string) => new PublicKey(p)); // All nodes
    const compression = assetResult?.compression || {};
    const nonce = compression.leaf_id ?? proofResult.node_index ?? 0;
    const creators = assetResult?.creators || [];
    const sellerFeeBps = assetResult?.royalty?.basis_points || 0;

    // Decode hashes (base58)
    const bs58 = require('bs58');
    const rootBytes = Buffer.from(bs58.decode(proofResult.root));
    const metaHash = Buffer.from(bs58.decode(compression.data_hash));

    // Derive accounts
    const [treeAuthority] = PublicKey.findProgramAddressSync([merkleTree.toBytes()], BUBBLEGUM);
    const lsBytes = listState.toBytes();
    const [feeVault] = PublicKey.findProgramAddressSync(
      [Buffer.from('fee_vault'), Buffer.from([lsBytes[lsBytes.length - 1]])], FEE_PROGRAM
    );

    const buyerAta = await getAssociatedTokenAddress(USDC_MINT, buyerPk);
    const ownerAta = await getAssociatedTokenAddress(USDC_MINT, owner);
    const feeVaultAta = await getAssociatedTokenAddress(USDC_MINT, feeVault, true);

    // Get makerBroker + rentPayer from list state (decoded earlier as 62Q9eeDY...)
    // For now decode from on-chain list state
    const listAcctResult = await heliusRpc('getAccountInfo', [listState.toBase58(), { encoding: 'base64' }]);
    let makerBroker = owner;
    let rentDest = owner;
    if (listAcctResult?.value) {
      // Use SDK decoder via dynamic import
      try {
        const sdk = await import('@tensor-foundation/marketplace');
        const decoder = sdk.getListStateDecoder();
        const data = new Uint8Array(Buffer.from(listAcctResult.value.data[0], 'base64'));
        const decoded = decoder.decode(data);
        if (decoded.makerBroker?.__option === 'Some') {
          makerBroker = new PublicKey(decoded.makerBroker.value);
        }
        if (decoded.rentPayer) {
          rentDest = new PublicKey(decoded.rentPayer);
        }
      } catch { /* fallback to owner */ }
    }

    const makerBrokerAta = await getAssociatedTokenAddress(USDC_MINT, makerBroker, true);

    // Build instruction data (correct layout from SDK encoder analysis)
    const creatorShares = Buffer.from(creators.map((c: any) => c.share));
    const creatorVerified = creators.map((c: any) => c.verified);
    const dataSize = 8 + 8 + 4 + 32 + 32 + (4 + creators.length) + (4 + creators.length) + 2 + 8 + 3;
    const ixData = Buffer.alloc(dataSize);
    let off = 0;
    BUY_SPL_COMPRESSED_DISC.copy(ixData, off); off += 8;
    ixData.writeBigUInt64LE(BigInt(nonce), off); off += 8;
    ixData.writeUInt32LE(nonce, off); off += 4;
    rootBytes.copy(ixData, off); off += 32;
    metaHash.copy(ixData, off); off += 32;
    ixData.writeUInt32LE(creators.length, off); off += 4;
    creatorShares.copy(ixData, off); off += creators.length;
    ixData.writeUInt32LE(creators.length, off); off += 4;
    for (const v of creatorVerified) { ixData.writeUInt8(v ? 1 : 0, off); off += 1; }
    ixData.writeUInt16LE(sellerFeeBps, off); off += 2;
    ixData.writeBigUInt64LE(maxAmount, off); off += 8;
    ixData.writeUInt8(1, off); off += 1; // Some(royaltyPct)
    ixData.writeUInt16LE(100, off); off += 2; // 100%

    // Build account keys (exact order from SDK + verified simulation)
    const keys = [
      { pubkey: feeVault, isSigner: false, isWritable: true },
      { pubkey: feeVaultAta, isSigner: false, isWritable: true },
      { pubkey: treeAuthority, isSigner: false, isWritable: false },
      { pubkey: merkleTree, isSigner: false, isWritable: true },
      { pubkey: NOOP, isSigner: false, isWritable: false },
      { pubkey: COMPRESSION, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      { pubkey: BUBBLEGUM, isSigner: false, isWritable: false },
      { pubkey: TENSOR, isSigner: false, isWritable: false },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: ASSOCIATED_TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: listState, isSigner: false, isWritable: true },
      { pubkey: buyerPk, isSigner: true, isWritable: false },
      { pubkey: buyerPk, isSigner: true, isWritable: true },
      { pubkey: buyerAta, isSigner: false, isWritable: true },
      { pubkey: owner, isSigner: false, isWritable: false },
      { pubkey: ownerAta, isSigner: false, isWritable: true },
      { pubkey: USDC_MINT, isSigner: false, isWritable: false },
      { pubkey: buyerPk, isSigner: false, isWritable: true },
      { pubkey: buyerAta, isSigner: false, isWritable: true },
      { pubkey: makerBroker, isSigner: false, isWritable: true },
      { pubkey: makerBrokerAta, isSigner: false, isWritable: true },
      { pubkey: rentDest, isSigner: false, isWritable: true },
      { pubkey: buyerPk, isSigner: true, isWritable: true },
      // Creators
      ...creators.map((c: any) => ({ pubkey: new PublicKey(c.address), isSigner: false, isWritable: true })),
      // Full proof path
      ...proofPath.map((p: PublicKey) => ({ pubkey: p, isSigner: false, isWritable: false })),
    ];

    // Load ALT for the transaction
    const connection = await fetch(HELIUS_RPC, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'getAddressLookupTable', params: [ALT_ADDRESS.toBase58()] }),
    }).then(r => r.json());
    
    // Build ALT account from RPC response
    const altData = connection.result?.value;
    let lookupTableAccounts: AddressLookupTableAccount[] = [];
    if (altData) {
      // Fetch via web3.js Connection for proper deserialization
      // We'll pass the ALT address to the frontend to resolve
    }

    // Build instructions
    const instructions: TransactionInstruction[] = [];
    instructions.push(ComputeBudgetProgram.setComputeUnitLimit({ units: 400000 }));

    // Check if buyer has USDC ATA
    const buyerAtaInfo = await heliusRpc('getAccountInfo', [buyerAta.toBase58()]);
    if (!buyerAtaInfo?.value) {
      instructions.push(createAssociatedTokenAccountInstruction(buyerPk, buyerAta, buyerPk, USDC_MINT));
    }

    instructions.push(new TransactionInstruction({ programId: TENSOR, keys, data: ixData.slice(0, off) }));

    // Return unsigned tx + ALT address for frontend to resolve
    return NextResponse.json({
      instructions: instructions.map(ix => ({
        programId: ix.programId.toBase58(),
        keys: ix.keys.map(k => ({
          pubkey: k.pubkey.toBase58(),
          isSigner: k.isSigner,
          isWritable: k.isWritable,
        })),
        data: Buffer.from(ix.data).toString('base64'),
      })),
      altAddress: ALT_ADDRESS.toBase58(),
      price: Number(amount) / 1e6,
      currency: 'USDC',
      seller: owner.toBase58(),
      mint,
    });

  } catch (err: any) {
    console.error('[tensor-buy] Error:', err);
    return NextResponse.json({ error: err.message || 'Failed to build Tensor buy tx' }, { status: 500 });
  }
}

export const maxDuration = 30;
