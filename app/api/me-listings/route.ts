import { NextResponse } from 'next/server';
import { Connection, PublicKey } from '@solana/web3.js';

// Proxy to Railway oracle listings index — fast, pre-indexed, real-time via webhooks
const ORACLE_API = 'https://artifacte-oracle-production.up.railway.app';
const HELIUS_RPC = `https://mainnet.helius-rpc.com/?api-key=${process.env.HELIUS_API_KEY}`;
const TENSOR_MARKETPLACE = new PublicKey('TCMPhJdwDryooaGtiocG1u3xcYbRpiJzb283XfCZsDp');
const USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';

// In-memory cache for Tensor prices — keyed by mint address
const TENSOR_CACHE_TTL = 60_000; // 60 seconds
const tensorPriceCache = new Map<string, { usdcPrice?: number; solPrice?: number; ts: number }>();

function getCachedPrice(mint: string) {
  const entry = tensorPriceCache.get(mint);
  if (!entry) return null;
  if (Date.now() - entry.ts > TENSOR_CACHE_TTL) {
    tensorPriceCache.delete(mint);
    return null;
  }
  return entry;
}

// Batch-fetch Tensor list_state PDAs to detect USDC-priced listings
async function enrichWithTensorPrices(listings: any[]): Promise<void> {
  const uncached: { mint: string; idx: number }[] = [];

  // Apply cached prices first, collect misses
  for (let i = 0; i < listings.length; i++) {
    const l = listings[i];
    if (!l.nftAddress || l.usdcPrice) continue;
    const cached = getCachedPrice(l.nftAddress);
    if (cached) {
      if (cached.usdcPrice) {
        l.usdcPrice = cached.usdcPrice;
        if (!l.solPrice) l.solPrice = l.price || 0;
      } else if (cached.solPrice && !l.solPrice) {
        l.solPrice = cached.solPrice;
      }
    } else {
      uncached.push({ mint: l.nftAddress, idx: i });
    }
  }

  if (uncached.length === 0) return;

  const conn = new Connection(HELIUS_RPC, 'confirmed');
  const BATCH = 100; // getMultipleAccounts limit

  for (let i = 0; i < uncached.length; i += BATCH) {
    const batch = uncached.slice(i, i + BATCH);
    const pdas = batch.map(({ mint }) => {
      const [pda] = PublicKey.findProgramAddressSync(
        [Buffer.from('list_state'), new PublicKey(mint).toBuffer()],
        TENSOR_MARKETPLACE
      );
      return pda;
    });

    try {
      const accounts = await conn.getMultipleAccountsInfo(pdas);
      const now = Date.now();
      for (let j = 0; j < accounts.length; j++) {
        const info = accounts[j];
        const mint = batch[j].mint;
        if (!info || info.data.length < 82) {
          // Cache miss (no Tensor listing) so we don't re-fetch
          tensorPriceCache.set(mint, { ts: now });
          continue;
        }
        const amount = Number(info.data.readBigUInt64LE(74));
        const hasCurrency = info.data[82] === 1;
        const currencyAddr = hasCurrency
          ? new PublicKey(info.data.subarray(83, 115)).toBase58()
          : null;

        const listing = listings[batch[j].idx];
        if (currencyAddr === USDC_MINT) {
          const usdcPrice = amount / 1e6;
          listing.usdcPrice = usdcPrice;
          if (!listing.solPrice) listing.solPrice = listing.price || 0;
          tensorPriceCache.set(mint, { usdcPrice, ts: now });
        } else if (amount > 0) {
          const solPrice = amount / 1e9;
          if (!listing.solPrice) listing.solPrice = solPrice;
          tensorPriceCache.set(mint, { solPrice, ts: now });
        } else {
          tensorPriceCache.set(mint, { ts: now });
        }
      }
    } catch (e: any) {
      console.warn(`[me-listings] Tensor batch enrichment error:`, e?.message);
    }
  }
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);

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

    // Enrich listings with Tensor USDC prices
    if (data.listings?.length && process.env.HELIUS_API_KEY) {
      try {
        await enrichWithTensorPrices(data.listings);
      } catch (e: any) {
        console.warn('[me-listings] Tensor enrichment failed:', e?.message);
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



export const maxDuration = 30;
