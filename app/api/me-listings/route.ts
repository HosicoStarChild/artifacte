import { NextResponse } from 'next/server';

// Proxy to Railway oracle listings index — fast, pre-indexed, real-time via webhooks
const ORACLE_API = 'https://artifacte-oracle-production.up.railway.app';
const ME_API_KEY = process.env.ME_API_KEY;
const ME_API_BASE = 'https://api-mainnet.magiceden.dev/v2';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const category = searchParams.get('category');

  // ── Phygitals: merge into TCG_CARDS when grade filter allows ──
  const gradeFilter = searchParams.get('grade') || '';
  const includePhygitals = category === 'TCG_CARDS' && 
    (!gradeFilter || gradeFilter === 'Ungraded' || gradeFilter === 'All' || gradeFilter === '');

  // Forward all query params to Railway
  const params = new URLSearchParams(searchParams.toString());

  try {
    // Fetch oracle listings
    const oraclePromise = fetch(`${ORACLE_API}/api/listings?${params}`, {
      signal: AbortSignal.timeout(15000),
      cache: 'no-store',
    });

    // Optionally fetch phygitals from ME and merge
    let phygitalListings: any[] = [];
    if (includePhygitals) {
      try {
        const phygRes = await fetchPhygitals(searchParams);
        phygitalListings = phygRes || [];
      } catch (e) {
        console.warn('[me-listings] Phygitals fetch failed, continuing with oracle only');
      }
    }

    const res = await oraclePromise;
    if (!res.ok) {
      throw new Error(`Oracle returned ${res.status}`);
    }

    const data = await res.json();
    
    // Merge phygitals into listings
    if (phygitalListings.length > 0) {
      data.listings = [...(data.listings || []), ...phygitalListings];
      data.total = (data.total || 0) + phygitalListings.length;
      // Re-sort by price if needed
      const sort = searchParams.get('sort') || '';
      if (sort === 'price-asc') {
        data.listings.sort((a: any, b: any) => (a.solPrice || a.price) - (b.solPrice || b.price));
      } else if (sort === 'price-desc') {
        data.listings.sort((a: any, b: any) => (b.solPrice || b.price) - (a.solPrice || a.price));
      }
    }

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

/** Fetch phygitals from ME and enrich with Helius metadata. Returns listing array. */
async function fetchPhygitals(searchParams: URLSearchParams): Promise<any[]> {
  if (!ME_API_KEY) return [];

  // Limit phygitals to 10 per page (mixed in with oracle results)
  const limit = 10;

  const res = await fetch(
    `${ME_API_BASE}/collections/phygitals/listings?offset=0&limit=${limit}`,
    { 
      headers: { 'Authorization': `Bearer ${ME_API_KEY}` },
      signal: AbortSignal.timeout(8000),
    }
  );

  if (!res.ok) return [];
  const meListings = await res.json();
  if (!Array.isArray(meListings)) return [];

  // Batch fetch metadata from Helius
  const HELIUS_KEY = process.env.HELIUS_API_KEY;
  let assetMap: Record<string, any> = {};
  
  if (HELIUS_KEY && meListings.length > 0) {
    try {
      const mints = meListings.map((l: any) => l.tokenMint);
      const assetRes = await fetch(`https://mainnet.helius-rpc.com/?api-key=${HELIUS_KEY}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(8000),
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

  // Apply TCG filter if set
  const tcgFilter = searchParams.get('ccCategory')?.toLowerCase() || '';

  return meListings.map((l: any) => {
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

    return {
      id: `phyg-${l.tokenMint}`,
      name,
      subtitle: [tcg, set, rarity, '• Phygital'].filter(Boolean).join(' • '),
      price: l.price,
      solPrice: l.price,
      image,
      nftAddress: l.tokenMint,
      source: 'phygitals',
      currency: 'SOL',
      category: 'TCG_CARDS',
      seller: l.seller,
      grade,
      tcg,
      rarity,
      set,
    };
  }).filter((card: any) => {
    // Filter by TCG if specified
    if (tcgFilter && !card.tcg.toLowerCase().includes(tcgFilter.toLowerCase())) return false;
    return true;
  });
}

export const maxDuration = 30;
