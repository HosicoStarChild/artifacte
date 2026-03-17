import { NextRequest, NextResponse } from 'next/server';

/**
 * Artifacte ME Proxy Buy API
 * 
 * Flow:
 * 1. Fetch listing details from ME
 * 2. Call ME /v2/instructions/buy_now with API key → get notary-cosigned tx
 * 3. Return serialized tx to frontend
 * 4. Frontend: buyer signs → submit to chain
 * 
 * Our 2% Artifacte fee is added as a separate SOL transfer in the frontend
 * BEFORE the ME buy tx (atomic: both in same wallet prompt).
 */

const ME_API_KEY = process.env.ME_API_KEY || '8fc012d5-a112-4bd4-9173-c78a616cea02';
const ME_API_BASE = 'https://api-mainnet.magiceden.dev/v2';

// CC auction house
const CC_AUCTION_HOUSE = 'E8cU1WiRWjanGxmn96ewBgk9vPTcL6AEZ1t6F6fkgUWe';

export async function POST(req: NextRequest) {
  try {
    const { mint, buyer } = await req.json();
    if (!mint || !buyer) {
      return NextResponse.json({ error: 'Missing mint or buyer' }, { status: 400 });
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
    const auctionHouse = listing.auctionHouse || CC_AUCTION_HOUSE;

    // 2. Call ME buy_now instructions API (returns notary-cosigned tx)
    const params = new URLSearchParams({
      buyer,
      seller,
      tokenMint: mint,
      tokenATA,
      price: price.toString(),
      auctionHouseAddress: auctionHouse,
      sellerExpiry: sellerExpiry.toString(),
    });

    const buyRes = await fetch(
      `${ME_API_BASE}/instructions/buy_now?${params}`,
      { headers: { 'Authorization': `Bearer ${ME_API_KEY}` } }
    );
    if (!buyRes.ok) {
      const errText = await buyRes.text();
      console.error('[me-buy] ME API error:', errText);
      return NextResponse.json({ error: `ME API error: ${errText}` }, { status: 502 });
    }

    const buyData = await buyRes.json();

    // 3. Return the v0 (versioned) tx with notary signature
    // Frontend will deserialize, add fee instruction, buyer signs, submit
    return NextResponse.json({
      // Versioned tx (preferred)
      v0Tx: buyData.v0?.txSigned?.data ? Buffer.from(buyData.v0.txSigned.data).toString('base64') : null,
      // Legacy tx fallback
      legacyTx: buyData.txSigned?.data ? Buffer.from(buyData.txSigned.data).toString('base64') : null,
      // Blockhash info
      blockhash: buyData.blockhashData?.blockhash,
      lastValidBlockHeight: buyData.blockhashData?.lastValidBlockHeight,
      // Listing info for frontend display
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
