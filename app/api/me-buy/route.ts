import { NextRequest, NextResponse } from 'next/server';

/**
 * Artifacte ME Proxy Buy API
 * 
 * Pure pass-through — no platform fee, exactly like Tensor.
 * 
 * Flow:
 * 1. Fetch listing details from ME
 * 2. Call ME /v2/instructions/buy_now → get notary-cosigned tx
 * 3. Return serialized tx to frontend
 * 4. Frontend: buyer signs → submit to chain
 */

const ME_API_KEY = process.env.ME_API_KEY;
if (!ME_API_KEY) {
  console.error('[me-buy] ME_API_KEY not set in environment');
}
const ME_API_BASE = 'https://api-mainnet.magiceden.dev/v2';
const CC_AUCTION_HOUSE = 'E8cU1WiRWjanGxmn96ewBgk9vPTcL6AEZ1t6F6fkgUWe';

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

    // 3. Return UNSIGNED tx for wallet to sign cleanly (no pre-filled notary sig)
    //    Plus the notary signature separately — frontend merges after wallet signs
    const v0TxUnsigned = buyData.v0?.tx?.data ? Buffer.from(buyData.v0.tx.data).toString('base64') : null;
    const v0TxSigned = buyData.v0?.txSigned?.data ? Buffer.from(buyData.v0.txSigned.data).toString('base64') : null;
    
    return NextResponse.json({
      v0Tx: v0TxUnsigned,        // unsigned — wallet signs this cleanly
      v0TxSigned: v0TxSigned,    // notary-signed — extract notary sig from this
      legacyTx: buyData.tx?.data ? Buffer.from(buyData.tx.data).toString('base64') : null,
      blockhash: buyData.blockhashData?.blockhash,
      lastValidBlockHeight: buyData.blockhashData?.lastValidBlockHeight,
      price,
      seller,
      mint,
      auctionHouse,
    });

  } catch (err: any) {
    console.error('[me-buy] Error:', err);
    return NextResponse.json({ error: err.message || 'Failed to build buy transaction' }, { status: 500 });
  }
}
