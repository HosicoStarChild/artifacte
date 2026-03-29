import { NextResponse } from 'next/server';
import { 
  PublicKey, TransactionMessage, VersionedTransaction, TransactionInstruction, SystemProgram,
} from '@solana/web3.js';
import { 
  getAssociatedTokenAddress, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID, createAssociatedTokenAccountInstruction,
} from '@solana/spl-token';

const HELIUS_RPC = `https://mainnet.helius-rpc.com/?api-key=${process.env.HELIUS_API_KEY}`;
const ME_API_KEY = process.env.ME_API_KEY || '';

const TENSOR_MARKETPLACE = new PublicKey('TCMPhJdwDryooaGtiocG1u3xcYbRpiJzb283XfCZsDp');
const BUBBLEGUM = new PublicKey('BGUMAp9Gq7iTEuizy4pqaxsTyUCBK68MDfK752saRPUY');
const SPL_NOOP = new PublicKey('noopb9bkMVfRPU8AsbpTUg8AQkHtKwMYZiFUjNRtMmV');
const SPL_ACCOUNT_COMPRESSION = new PublicKey('cmtDvXumGCrqC1Age74AVPhSRVXJMd8PJS91L8KbNCK');
const USDC_MINT = new PublicKey('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v');
const TENSOR_FEE_VAULT_PROGRAM = new PublicKey('TFEEgwDP6nn1s8mMX2tTNPPz8j2VomkphLUmyxKm17A');
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

    // Derive Tensor list state PDA
    const [listState] = PublicKey.findProgramAddressSync(
      [Buffer.from('list_state'), assetId.toBytes()], TENSOR_MARKETPLACE
    );

    // Parallel fetch: ME RPC listing + asset proof + asset data + blockhash
    // Must include collectionSymbol for splPrice to appear in RPC response
    const meQ = JSON.stringify({ $match: { collectionSymbol: 'phygitals', tokenMint: mint }, $sort: { 'tapioca.v': 1 }, $skip: 0, $limit: 1 });
    const [meRes, proofResult, assetResult, blockhashResult, buyerAtaResult] = await Promise.all([
      fetch(`https://api-mainnet.magiceden.dev/rpc/getListedNFTsByQuery?q=${encodeURIComponent(meQ)}`, {
        headers: { Authorization: `Bearer ${ME_API_KEY}` }, signal: AbortSignal.timeout(8000),
      }).then(r => r.json()).catch(() => null),
      heliusRpc('getAssetProof', { id: mint }),
      heliusRpc('getAsset', { id: mint }),
      heliusRpc('getLatestBlockhash', [{ commitment: 'confirmed' }]),
      getAssociatedTokenAddress(USDC_MINT, buyerPk).then(ata =>
        heliusRpc('getAccountInfo', [ata.toBase58()]).then(r => ({ ata, exists: !!r?.value }))
      ),
    ]);

    // Parse listing from ME RPC
    const item = meRes?.results?.data?.[0];
    if (!item) return NextResponse.json({ error: 'Listing not found on ME' }, { status: 404 });

    const owner = new PublicKey(item.owner);
    const spl = item.priceInfo?.splPrice || item.splPrice;
    if (!spl || spl.symbol !== 'USDC') {
      return NextResponse.json({ error: 'Only USDC listings supported via Tensor' }, { status: 400 });
    }
    const amount = BigInt(spl.rawAmount);
    const maxAmount = amount + (amount * BigInt(5) / BigInt(100)); // 5% slippage

    // Parse proof
    if (!proofResult) return NextResponse.json({ error: 'Failed to get asset proof' }, { status: 502 });
    const merkleTree = new PublicKey(proofResult.tree_id);
    // Trim proof to fit tx size limit — tree has canopy that covers the rest
    // Max ~12 proof nodes fit in a v0 transaction with all required accounts
    const MAX_PROOF_NODES = 12;
    const proofPath = proofResult.proof.slice(0, MAX_PROOF_NODES).map((p: string) => new PublicKey(p));

    // Creators
    const creators = assetResult?.creators || [];

    // Derive accounts
    const [treeAuthority] = PublicKey.findProgramAddressSync([merkleTree.toBytes()], BUBBLEGUM);
    
    // Fee vault: Tensor uses TFEEgwDP... program, PDA from last byte of list state
    const listStateBytes = listState.toBytes();
    const [feeVault] = PublicKey.findProgramAddressSync(
      [Buffer.from('fee_vault'), Buffer.from([listStateBytes[listStateBytes.length - 1]])], TENSOR_FEE_VAULT_PROGRAM
    );

    const buyerUsdcAta = buyerAtaResult.ata;
    const ownerUsdcAta = await getAssociatedTokenAddress(USDC_MINT, owner);
    const feeVaultUsdcAta = await getAssociatedTokenAddress(USDC_MINT, feeVault, true);

    // Build instruction data
    // Decode base58 hashes
    const BASE58_ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
    const decodeBase58 = (str: string): Buffer => {
      let result = BigInt(0);
      for (const char of str) {
        const idx = BASE58_ALPHABET.indexOf(char);
        if (idx === -1) throw new Error(`Invalid base58 char: ${char}`);
        result = result * BigInt(58) + BigInt(idx);
      }
      const bytes: number[] = [];
      while (result > BigInt(0)) {
        bytes.unshift(Number(result % BigInt(256)));
        result = result / BigInt(256);
      }
      // Add leading zeros for leading '1's in base58
      for (const char of str) {
        if (char === '1') bytes.unshift(0);
        else break;
      }
      // Pad to 32 bytes
      while (bytes.length < 32) bytes.unshift(0);
      return Buffer.from(bytes);
    }
    
    const compression = assetResult?.compression || {};
    const rootBytes = decodeBase58(proofResult.root);
    const dataHashBytes = decodeBase58(compression.data_hash || '11111111111111111111111111111111');
    const creatorHashBytes = decodeBase58(compression.creator_hash || '11111111111111111111111111111111');
    const nonce = compression.leaf_id ?? proofResult.node_index ?? 0;

    const ixData = Buffer.alloc(8 + 8 + 3 + 32 + 32 + 32 + 8 + 4);
    let off = 0;
    BUY_SPL_COMPRESSED_DISC.copy(ixData, off); off += 8;
    ixData.writeBigUInt64LE(maxAmount, off); off += 8;
    ixData.writeUInt8(1, off); off += 1; // Some(royaltyPct)
    ixData.writeUInt16LE(10000, off); off += 2; // 100% royalty
    Buffer.from(rootBytes).copy(ixData, off); off += 32;
    Buffer.from(dataHashBytes).copy(ixData, off); off += 32;
    Buffer.from(creatorHashBytes).copy(ixData, off); off += 32;
    ixData.writeBigUInt64LE(BigInt(nonce), off); off += 8;
    ixData.writeUInt32LE(nonce, off); off += 4;

    // Build account keys (order matters — matches SDK's getBuySplCompressedInstruction)
    // Account order MUST match Tensor SDK's getBuySplCompressedInstruction exactly
    const keys = [
      { pubkey: feeVault, isSigner: false, isWritable: true },           // feeVault
      { pubkey: feeVaultUsdcAta, isSigner: false, isWritable: true },    // feeVaultCurrencyTa
      { pubkey: treeAuthority, isSigner: false, isWritable: false },     // treeAuthority
      { pubkey: merkleTree, isSigner: false, isWritable: true },         // merkleTree
      { pubkey: SPL_NOOP, isSigner: false, isWritable: false },          // logWrapper
      { pubkey: SPL_ACCOUNT_COMPRESSION, isSigner: false, isWritable: false }, // compressionProgram
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false }, // systemProgram
      { pubkey: BUBBLEGUM, isSigner: false, isWritable: false },         // bubblegumProgram
      { pubkey: TENSOR_MARKETPLACE, isSigner: false, isWritable: false },// marketplaceProgram
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },  // currencyTokenProgram
      { pubkey: ASSOCIATED_TOKEN_PROGRAM_ID, isSigner: false, isWritable: false }, // associatedTokenProgram
      { pubkey: listState, isSigner: false, isWritable: true },          // listState
      { pubkey: buyerPk, isSigner: true, isWritable: false },            // buyer
      { pubkey: buyerPk, isSigner: true, isWritable: true },             // payer
      { pubkey: buyerUsdcAta, isSigner: false, isWritable: true },       // payerCurrencyTa
      { pubkey: owner, isSigner: false, isWritable: false },             // owner
      { pubkey: ownerUsdcAta, isSigner: false, isWritable: true },       // ownerCurrencyTa
      { pubkey: USDC_MINT, isSigner: false, isWritable: false },         // currency
      { pubkey: buyerPk, isSigner: false, isWritable: true },            // takerBroker
      { pubkey: buyerUsdcAta, isSigner: false, isWritable: true },       // takerBrokerTa
      { pubkey: owner, isSigner: false, isWritable: true },              // makerBroker
      { pubkey: ownerUsdcAta, isSigner: false, isWritable: true },       // makerBrokerTa
      { pubkey: owner, isSigner: false, isWritable: true },              // rentDestination
      { pubkey: owner, isSigner: false, isWritable: true },              // rentPayer
      // Creators (remaining accounts)
      ...creators.map((c: any) => ({ pubkey: new PublicKey(c.address), isSigner: false, isWritable: true })),
      // Proof path (remaining accounts)
      ...proofPath.map((p: PublicKey) => ({ pubkey: p, isSigner: false, isWritable: false })),
    ];

    const instructions: TransactionInstruction[] = [];
    
    // Create buyer USDC ATA if needed
    if (!buyerAtaResult.exists) {
      instructions.push(createAssociatedTokenAccountInstruction(buyerPk, buyerUsdcAta, buyerPk, USDC_MINT));
    }
    
    instructions.push(new TransactionInstruction({ programId: TENSOR_MARKETPLACE, keys, data: ixData }));

    const msg = new TransactionMessage({
      payerKey: buyerPk,
      recentBlockhash: blockhashResult.value.blockhash,
      instructions,
    }).compileToV0Message();

    const tx = new VersionedTransaction(msg);

    return NextResponse.json({
      tx: Buffer.from(tx.serialize()).toString('base64'),
      price: Number(amount) / 1e6,
      currency: 'USDC',
      seller: owner.toBase58(),
      mint,
      listState: listState.toBase58(),
    });

  } catch (err: any) {
    console.error('[tensor-buy] Error:', err);
    return NextResponse.json({ error: err.message || 'Failed to build Tensor buy tx' }, { status: 500 });
  }
}

export const maxDuration = 30;
