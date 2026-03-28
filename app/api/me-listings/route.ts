import { NextResponse } from 'next/server';

// Proxy to Railway oracle listings index — fast, pre-indexed, real-time via webhooks
const ORACLE_API = 'https://artifacte-oracle-production.up.railway.app';
const ME_API_KEY = process.env.ME_API_KEY;
const ME_API_BASE = 'https://api-mainnet.magiceden.dev/v2';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const category = searchParams.get('category');

  // ── Phygitals: fetch directly from ME collection API ──
  if (category === 'PHYGITALS') {
    return handlePhygitals(searchParams);
  }

  // Forward all query params to Railway
  const params = new URLSearchParams(searchParams.toString());

  try {
    const res = await fetch(`${ORACLE_API}/api/listings?${params}`, {
      signal: AbortSignal.timeout(15000),
      cache: 'no-store',
    });

    if (!res.ok) {
      throw new Error(`Oracle returned ${res.status}`);
    }

    const data = await res.json();

    const response = NextResponse.json(data);
    response.headers.set('Cache-Control', 'public, s-maxage=10, stale-while-revalidate=30');
    return response;
  } catch (err: any) {
    console.error('Listings proxy error:', err?.message);
    return NextResponse.json(
      { error: 'Failed to fetch listings', message: err?.message },
      { status: 500 }
    );
  }
}

async function handlePhygitals(searchParams: URLSearchParams) {
  if (!ME_API_KEY) {
    return NextResponse.json({ error: 'ME API key not configured' }, { status: 500 });
  }

  const page = parseInt(searchParams.get('page') || '1');
  const perPage = parseInt(searchParams.get('perPage') || '20');
  const sort = searchParams.get('sort') || 'price-asc';
  const offset = (page - 1) * perPage;

  try {
    // Fetch listings from ME collection
    const meParams = new URLSearchParams({
      offset: offset.toString(),
      limit: perPage.toString(),
    });

    const res = await fetch(
      `${ME_API_BASE}/collections/phygitals/listings?${meParams}`,
      { 
        headers: { 'Authorization': `Bearer ${ME_API_KEY}` },
        signal: AbortSignal.timeout(10000),
      }
    );

    if (!res.ok) throw new Error(`ME API returned ${res.status}`);
    const meListings = await res.json();
    if (!Array.isArray(meListings)) throw new Error('Invalid ME response');

    // Fetch metadata for each listing via Helius (batched)
    const HELIUS_KEY = process.env.HELIUS_API_KEY;
    let assetMap: Record<string, any> = {};
    
    if (HELIUS_KEY && meListings.length > 0) {
      try {
        const mints = meListings.map((l: any) => l.tokenMint);
        const assetRes = await fetch(`https://mainnet.helius-rpc.com/?api-key=${HELIUS_KEY}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: AbortSignal.timeout(10000),
          body: JSON.stringify({
            jsonrpc: '2.0', id: 1,
            method: 'getAssetBatch',
            params: { ids: mints },
          }),
        });
        const assetData = await assetRes.json();
        if (assetData.result) {
          for (const asset of assetData.result) {
            if (asset?.id) assetMap[asset.id] = asset;
          }
        }
      } catch (e) {
        console.warn('[phygitals] Helius batch failed, using ME data only');
      }
    }

    // Transform to Artifacte listing format
    const listings = meListings.map((l: any) => {
      const asset = assetMap[l.tokenMint];
      const metadata = asset?.content?.metadata;
      const attrs = asset?.content?.metadata?.attributes || [];
      const getAttr = (name: string) => attrs.find((a: any) => 
        a.trait_type?.toLowerCase() === name.toLowerCase()
      )?.value;

      const name = metadata?.name || l.tokenMint.slice(0, 12);
      const image = asset?.content?.links?.image || asset?.content?.files?.[0]?.uri || '';
      const tcg = getAttr('TCG') || getAttr('Game') || '';
      const rarity = getAttr('Rarity') || '';
      const set = getAttr('Set') || '';
      const grade = getAttr('Grade') || 'Ungraded';
      const cardNumber = getAttr('Card Number') || '';
      const year = getAttr('Year') || '';
      const tcgPlayerId = getAttr('TCGplayer Product ID') || getAttr('TCGplayer_Product_ID') || '';

      return {
        id: `phyg-${l.tokenMint}`,
        name,
        subtitle: [tcg, set, rarity].filter(Boolean).join(' • '),
        price: Math.round(l.price * 1e9), // lamports for display
        solPrice: l.price,
        image,
        nftAddress: l.tokenMint,
        source: 'phygitals',
        currency: 'SOL',
        category: 'PHYGITALS',
        seller: l.seller,
        badge: 'Phygital',
        badgeColor: 'violet',
        tcg,
        rarity,
        set,
        grade,
        cardNumber,
        year,
        tcgPlayerId,
      };
    });

    // Get total count (ME doesn't return total, estimate from stat)
    const statRes = await fetch(
      `${ME_API_BASE}/collections/phygitals/stats`,
      { headers: { 'Authorization': `Bearer ${ME_API_KEY}` }, signal: AbortSignal.timeout(5000) }
    ).catch(() => null);
    const stats = await statRes?.json().catch(() => ({}));
    const total = stats?.listedCount || 11000;

    const response = NextResponse.json({
      listings,
      total,
      page,
      perPage,
      totalPages: Math.ceil(total / perPage),
    });
    response.headers.set('Cache-Control', 'public, s-maxage=30, stale-while-revalidate=60');
    return response;
  } catch (err: any) {
    console.error('[phygitals] Error:', err?.message);
    return NextResponse.json(
      { error: 'Failed to fetch phygitals', message: err?.message },
      { status: 500 }
    );
  }
}

export const maxDuration = 30;
