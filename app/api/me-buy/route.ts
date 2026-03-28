import { NextRequest, NextResponse } from 'next/server';
import { 
  Connection, PublicKey, TransactionInstruction, TransactionMessage, 
  VersionedTransaction, SystemProgram, AddressLookupTableAccount 
} from '@solana/web3.js';

/**
 * Artifacte Buy API
 * 
 * Rebuilds ME buy_now tx with 2% platform fee.
 * 
 * Flow:
 * 1. Fetch listing details from ME
 * 2. Call ME /v2/instructions/buy_now → get base tx
 * 3. Decompile tx, add platform fee, recompile with buyer-only signing
 * 4. Return tx to frontend (no notary needed — requires_sign_off = false)
 */

const ME_API_KEY = process.env.ME_API_KEY;
if (!ME_API_KEY) {
  console.error('[me-buy] ME_API_KEY not set in environment');
}
const ME_API_BASE = 'https://api-mainnet.magiceden.dev/v2';
const CC_AUCTION_HOUSE = 'E8cU1WiRWjanGxmn96ewBgk9vPTcL6AEZ1t6F6fkgUWe';
const HELIUS_RPC = `https://mainnet.helius-rpc.com/?api-key=${process.env.HELIUS_API_KEY}`;
const PLATFORM_TREASURY = new PublicKey('6drXw31FjHch4ixXa4ngTyUD2cySUs3mpcB2YYGA9g7P');
const PLATFORM_FEE_BPS = 200; // 2%
const ME_NOTARY = 'NTYeYJ1wr4bpM5xo6zx5En44SvJFAd35zTxxNoERYqd';

// Simple in-memory rate limiter: max 10 requests per minute per IP
const rateMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT = 10;
const RATE_WINDOW_MS = 60_000;

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = rateMap.get(ip);
  if (!entry || now > entry.resetAt) {
    rateMap.set(ip, { count: 1, resetAt: now + RATE_WINDOW_MS });
    return true;
  }
  if (entry.count >= RATE_LIMIT) return false;
  entry.count++;
  return true;
}

export async function POST(req: NextRequest) {
  try {
    const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || req.headers.get('x-real-ip') || 'unknown';
    if (!checkRateLimit(ip)) {
      return NextResponse.json({ error: 'Rate limit exceeded. Try again in a minute.' }, { status: 429 });
    }

    const { mint, buyer } = await req.json();
    if (!mint || !buyer) {
      return NextResponse.json({ error: 'Missing mint or buyer' }, { status: 400 });
    }
    if (!ME_API_KEY) {
      return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
    }

    // Validate mint and buyer are valid base58 public keys (32 bytes)
    const base58Regex = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
    if (!base58Regex.test(mint) || !base58Regex.test(buyer)) {
      return NextResponse.json({ error: 'Invalid address format' }, { status: 400 });
    }

    // 1. Fetch active listing from ME
    const listingsRes = await fetch(
      `${ME_API_BASE}/tokens/${mint}/listings`,
      { headers: { 'Authorization': `Bearer ${ME_API_KEY}` }, signal: AbortSignal.timeout(10000) }
    );
    if (!listingsRes.ok) {
      return NextResponse.json({ error: 'Failed to fetch listing' }, { status: 502 });
    }
    const listings = await listingsRes.json();
    if (!listings?.length) {
      return NextResponse.json({ error: 'No active listing found' }, { status: 404 });
    }

    const listing = listings[0];
    const seller = listing.seller;
    const tokenATA = listing.tokenAddress;
    const price = listing.price;
    const sellerExpiry = listing.expiry ?? -1;
    const auctionHouse = listing.auctionHouse || CC_AUCTION_HOUSE;

    // 1b. Verify NFT is still owned by the seller (catch stale listings)
    const HELIUS_KEY = process.env.HELIUS_API_KEY;
    if (HELIUS_KEY) {
      try {
        const assetRes = await fetch(`https://mainnet.helius-rpc.com/?api-key=${HELIUS_KEY}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: AbortSignal.timeout(5000),
          body: JSON.stringify({
            jsonrpc: '2.0', id: 1,
            method: 'getAsset',
            params: { id: mint },
          }),
        });
        const assetData = await assetRes.json();
        const currentOwner = assetData?.result?.ownership?.owner;
        const ME_ESCROW = '1BWutmTvYPwDtmw9abTkS4Ssr8no61spGAvW1X6NDix';
        // NFT is valid if owned by seller OR in ME escrow (listed cards transfer to escrow)
        if (currentOwner && currentOwner !== seller && currentOwner !== ME_ESCROW) {
          return NextResponse.json({ 
            error: 'This listing is no longer available — the NFT has already been sold.' 
          }, { status: 410 });
        }
      } catch (e) {
        // Non-fatal — proceed with buy attempt
        console.warn('[me-buy] Ownership check failed, proceeding:', e);
      }
    }

    // 2. Call ME buy_now instructions API (atomic buy + execute_sale in one tx)
    // /buy_now handles pNFT transfer via mip1_execute_sale_v2 — NOT /buy (which only places a bid)
    const params = new URLSearchParams({
      buyer,
      seller,
      tokenMint: mint,
      price: price.toString(),
      auctionHouseAddress: auctionHouse,
    });
    // tokenATA is required — this is the escrow ATA where the NFT is held
    if (tokenATA) params.set('tokenATA', tokenATA);
    if (sellerExpiry && sellerExpiry !== -1) params.set('sellerExpiry', sellerExpiry.toString());

    const buyRes = await fetch(
      `${ME_API_BASE}/instructions/buy_now?${params}`,
      { headers: { 'Authorization': `Bearer ${ME_API_KEY}` }, signal: AbortSignal.timeout(15000) }
    );
    if (!buyRes.ok) {
      const errText = await buyRes.text();
      console.error('[me-buy] ME API error:', errText);
      return NextResponse.json({ error: `ME API error: ${errText}` }, { status: 502 });
    }

    const buyData = await buyRes.json();

    // 3. Rebuild tx with platform fee — decompile ME tx, add fee, recompile
    const conn = new Connection(HELIUS_RPC);
    const meTx = VersionedTransaction.deserialize(Buffer.from(buyData.v0.tx.data));
    const meKeys = meTx.message.staticAccountKeys;
    const numSig = meTx.message.header.numRequiredSignatures;
    const numReadonlySig = meTx.message.header.numReadonlySignedAccounts;
    const numReadonlyUnsigned = meTx.message.header.numReadonlyUnsignedAccounts;
    const totalStatic = meKeys.length;
    
    // Load address lookup tables
    const lookupAddrs = meTx.message.addressTableLookups || [];
    const lookupTables: AddressLookupTableAccount[] = [];
    for (const lt of lookupAddrs) {
      const ltAcct = await conn.getAddressLookupTable(lt.accountKey);
      if (ltAcct.value) lookupTables.push(ltAcct.value);
    }
    
    // Resolve account key by index (static + lookup table)
    const getKey = (idx: number): PublicKey | null => {
      if (idx < totalStatic) return meKeys[idx];
      let offset = totalStatic;
      for (const lt of lookupAddrs) {
        const table = lookupTables.find(t => t.key.equals(lt.accountKey));
        if (!table) continue;
        if (idx < offset + lt.writableIndexes.length) {
          return table.state.addresses[lt.writableIndexes[idx - offset]];
        }
        offset += lt.writableIndexes.length;
        if (idx < offset + lt.readonlyIndexes.length) {
          return table.state.addresses[lt.readonlyIndexes[idx - offset]];
        }
        offset += lt.readonlyIndexes.length;
      }
      return null;
    }
    
    // Decompile all ME instructions (make notary non-signer)
    const instructions = meTx.message.compiledInstructions.map(cix => {
      return new TransactionInstruction({
        programId: getKey(cix.programIdIndex)!,
        keys: cix.accountKeyIndexes.map(idx => {
          const pubkey = getKey(idx)!;
          let isSigner = idx < numSig;
          let isWritable: boolean;
          if (idx < numSig) {
            isWritable = idx < (numSig - numReadonlySig);
          } else if (idx < totalStatic) {
            isWritable = idx < (totalStatic - numReadonlyUnsigned);
          } else {
            isWritable = false;
            let off = totalStatic;
            for (const lt of lookupAddrs) {
              if (idx < off + lt.writableIndexes.length) { isWritable = true; break; }
              off += lt.writableIndexes.length;
              if (idx < off + lt.readonlyIndexes.length) { isWritable = false; break; }
              off += lt.readonlyIndexes.length;
            }
          }
          // Notary doesn't need to sign (requires_sign_off = false)
          if (pubkey.toString() === ME_NOTARY) isSigner = false;
          return { pubkey, isSigner, isWritable };
        }),
        data: Buffer.from(cix.data),
      });
    });
    
    // Add 2% platform fee transfer
    const buyerPK = new PublicKey(buyer);
    const priceLamports = Math.round(price * 1e9);
    const feeLamports = Math.round(priceLamports * PLATFORM_FEE_BPS / 10000);
    const feeIx = SystemProgram.transfer({
      fromPubkey: buyerPK,
      toPubkey: PLATFORM_TREASURY,
      lamports: feeLamports,
    });
    
    // Build new tx: [compute, compute, fee, deposit, buy, execute_sale]
    const allIx = [instructions[0], instructions[1], feeIx, ...instructions.slice(2)];
    
    const { blockhash: freshBlockhash, lastValidBlockHeight: freshHeight } = await conn.getLatestBlockhash();
    const msg = new TransactionMessage({
      payerKey: buyerPK,
      recentBlockhash: freshBlockhash,
      instructions: allIx,
    }).compileToV0Message(lookupTables.length ? lookupTables : undefined);
    
    const vtx = new VersionedTransaction(msg);
    const txBase64 = Buffer.from(vtx.serialize()).toString('base64');
    
    return NextResponse.json({
      v0Tx: txBase64,
      v0TxSigned: txBase64, // same — no notary sig needed
      blockhash: freshBlockhash,
      lastValidBlockHeight: freshHeight,
      price,
      platformFee: feeLamports / 1e9,
      seller,
      mint,
      auctionHouse,
    });

  } catch (err: any) {
    console.error('[me-buy] Error:', err);
    return NextResponse.json({ error: err.message || 'Failed to build buy transaction' }, { status: 500 });
  }
}
