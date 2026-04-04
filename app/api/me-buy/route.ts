import { NextRequest, NextResponse } from 'next/server';

/**
 * Artifacte ME Proxy Buy API
 * 
 * Supports both M2 (auction house) and M3 (MMM pool) listings.
 * 
 * Flow for M2 (CC cards, pNFTs):
 * 1. Fetch listing → call ME /v2/instructions/buy_now → return cosigned tx
 * 
 * Flow for M3 (Phygitals, cNFTs):
 * 1. Fetch listing → detect M3 (empty auctionHouse)
 * 2. Call ME /v2/instructions/batch with type "m3_buy_now"
 * 3. Return cosigned tx (same format)
 */

const ME_API_KEY = process.env.ME_API_KEY;
if (!ME_API_KEY) {
  console.error('[me-buy] ME_API_KEY not set in environment');
}
const ME_API_BASE = 'https://api-mainnet.magiceden.dev/v2';
const ME_BATCH_BASE = 'https://api-mainnet.magiceden.us/v2';
const CC_AUCTION_HOUSE = 'E8cU1WiRWjanGxmn96ewBgk9vPTcL6AEZ1t6F6fkgUWe';
const TREASURY_WALLET = '6drXw31FjHch4ixXa4ngTyUD2cySUs3mpcB2YYGA9g7P';

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

    // 1. Fetch active listing from ME
    const listingsRes = await fetch(
      `${ME_API_BASE}/tokens/${mint}/listings`,
      { headers: { 'Authorization': `Bearer ${ME_API_KEY}` } }
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
    const auctionHouse = listing.auctionHouse;
    const listingSource = listing.listingSource;
    const isM3 = !auctionHouse || listingSource === 'M3';

    // 1b. Verify NFT is still available (skip for M3 — pool handles availability)
    const HELIUS_KEY = process.env.HELIUS_API_KEY;
    if (HELIUS_KEY && !isM3) {
      try {
        const assetRes = await fetch(`https://mainnet.helius-rpc.com/?api-key=${HELIUS_KEY}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            jsonrpc: '2.0', id: 1,
            method: 'getAsset',
            params: { id: mint },
          }),
        });
        const assetData = await assetRes.json();
        const currentOwner = assetData?.result?.ownership?.owner;
        // For M3/MMM listings, NFT is held in ME's escrow PDA (2aSJBUGp...)
        const ME_CNFT_ESCROW = '2aSJBUGpWWUZty3dafov1Z8Edw3YPA6Z1e2X3aqXu27i';
        const ME_M2_ESCROW = '1BWutmTvYPwDtmw9abTkS4Ssr8no61spGAvW1X6NDix';
        if (currentOwner && currentOwner !== seller && currentOwner !== ME_CNFT_ESCROW && currentOwner !== ME_M2_ESCROW) {
          console.log('[me-buy] Ownership mismatch:', { currentOwner, seller, mint, isM3 });
          return NextResponse.json({ 
            error: 'This listing is no longer available — the NFT has already been sold.' 
          }, { status: 410 });
        }
      } catch (e) {
        console.warn('[me-buy] Ownership check failed, proceeding:', e);
      }
    }

    let buyData: any;

    if (isM3) {
      // ── M3 path (Phygitals, cNFTs, MMM pool listings) ──
      // Uses the batch endpoint on api-mainnet.magiceden.us
      console.log('[me-buy] M3 listing detected, using batch endpoint');
      
      const q = JSON.stringify([{
        type: 'm3_buy_now',
        ins: {
          buyer,
          seller,
          assetId: mint,
          price,
        }
      }]);

      const batchUrl = `${ME_BATCH_BASE}/instructions/batch?q=${encodeURIComponent(q)}&prioFeeMicroLamports=50000&maxPrioFeeLamports=10000000`;
      
      const batchRes = await fetch(batchUrl, {
        headers: { 'Authorization': `Bearer ${ME_API_KEY}` },
        signal: AbortSignal.timeout(15000),
      });
      if (!batchRes.ok) {
        const errText = await batchRes.text();
        console.error('[me-buy] ME batch API error:', errText);
        return NextResponse.json({ error: `ME API error: ${errText}` }, { status: 502 });
      }

      const batchData = await batchRes.json();
      const result = batchData[0];
      
      if (result.status === 'rejected') {
        console.error('[me-buy] M3 buy rejected:', result.reason);
        return NextResponse.json({ error: result.reason }, { status: 502 });
      }

      buyData = result.value;
    } else {
      // ── M2 path (CC cards, pNFTs, standard auction house listings) ──
      const USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
      const params = new URLSearchParams({
        buyer,
        seller,
        tokenMint: mint,
        price: price.toString(),
        auctionHouseAddress: auctionHouse || CC_AUCTION_HOUSE,
        paymentMint: USDC_MINT, // Required for ME to build full USDC pNFT accounts
      });
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

      buyData = await buyRes.json();
    }

    // 3. Return cosigned tx (same format for both M2 and M3)
    return NextResponse.json({
      v0Tx: buyData.v0?.tx?.data ? Buffer.from(buyData.v0.tx.data).toString('base64') : null,
      v0TxSigned: buyData.v0?.txSigned?.data ? Buffer.from(buyData.v0.txSigned.data).toString('base64') : 
                  buyData.txSigned?.data ? Buffer.from(buyData.txSigned.data).toString('base64') : null,
      legacyTx: buyData.tx?.data ? Buffer.from(buyData.tx.data).toString('base64') : null,
      blockhash: buyData.blockhashData?.blockhash,
      lastValidBlockHeight: buyData.blockhashData?.lastValidBlockHeight,
      price,
      seller,
      mint,
      listingSource: isM3 ? 'M3' : 'M2',
      auctionHouse: auctionHouse || null,
    });

  } catch (err: any) {
    console.error('[me-buy] Error:', err);
    return NextResponse.json({ error: err.message || 'Failed to build buy transaction' }, { status: 500 });
  }
}
