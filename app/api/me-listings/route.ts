import { NextResponse } from 'next/server';
import { Connection, PublicKey } from '@solana/web3.js';
import { getActiveArtifacteMintSet } from '@/lib/artifacte-listings';

// Proxy to Railway oracle listings index — fast, pre-indexed, real-time via webhooks
const ORACLE_API = 'https://artifacte-oracle-production.up.railway.app';
const HELIUS_RPC = `https://mainnet.helius-rpc.com/?api-key=${process.env.HELIUS_API_KEY}`;
const TENSOR_MARKETPLACE = new PublicKey('TCMPhJdwDryooaGtiocG1u3xcYbRpiJzb283XfCZsDp');
const USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
const ORACLE_BATCH_SIZE = 250;

type OracleListing = {
  id?: string;
  nftAddress?: string;
  source?: string;
  marketplace?: string;
  verifiedBy?: string;
  usdcPrice?: number;
  solPrice?: number;
  price?: number;
  [key: string]: unknown;
};

type OracleListingsResponse = {
  listings?: OracleListing[];
  total?: number;
  [key: string]: unknown;
};

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

function parsePositiveInt(value: string | null, fallback: number): number {
  const parsed = Number.parseInt(value || '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function shouldFilterArtifacteRows(category: string | null): boolean {
  return category === 'TCG_CARDS' && Boolean(process.env.HELIUS_API_KEY);
}

function isArtifacteOracleListing(listing: OracleListing): boolean {
  return listing.source === 'artifacte' || listing.marketplace === 'artifacte' || listing.verifiedBy === 'Artifacte';
}

function getOracleListingMint(listing: OracleListing): string | null {
  if (typeof listing.nftAddress === 'string' && listing.nftAddress) return listing.nftAddress;
  if (typeof listing.id === 'string' && listing.id) return listing.id;
  return null;
}

async function fetchOraclePage(params: URLSearchParams): Promise<OracleListingsResponse> {
  const res = await fetch(`${ORACLE_API}/api/listings?${params}`, {
    signal: AbortSignal.timeout(15000),
    cache: 'no-store',
  });

  if (!res.ok) {
    throw new Error(`Oracle returned ${res.status}`);
  }

  return res.json() as Promise<OracleListingsResponse>;
}

async function fetchAllOracleListings(params: URLSearchParams): Promise<OracleListingsResponse> {
  const batchParams = new URLSearchParams(params.toString());
  batchParams.set('page', '1');
  batchParams.set('perPage', String(ORACLE_BATCH_SIZE));

  const firstPage = await fetchOraclePage(batchParams);
  const allListings = Array.isArray(firstPage.listings) ? [...firstPage.listings] : [];
  const total = typeof firstPage.total === 'number' ? firstPage.total : allListings.length;
  const totalPages = Math.max(1, Math.ceil(total / ORACLE_BATCH_SIZE));

  for (let page = 2; page <= totalPages; page++) {
    batchParams.set('page', String(page));
    const nextPage = await fetchOraclePage(batchParams);
    if (!Array.isArray(nextPage.listings) || nextPage.listings.length === 0) break;
    allListings.push(...nextPage.listings);
  }

  return {
    ...firstPage,
    listings: allListings,
    total: allListings.length,
  };
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const category = searchParams.get('category');
  const requestedPage = parsePositiveInt(searchParams.get('page'), 1);
  const requestedPerPage = Math.min(100, Math.max(1, parsePositiveInt(searchParams.get('perPage'), 24)));
  const filterArtifacteRows = shouldFilterArtifacteRows(category);

  // Forward all query params to Railway
  const params = new URLSearchParams(searchParams.toString());

  try {
    const data = filterArtifacteRows
      ? await fetchAllOracleListings(params)
      : await fetchOraclePage(params);

    let listings = Array.isArray(data.listings) ? data.listings : [];
    let total = typeof data.total === 'number' ? data.total : listings.length;

    if (filterArtifacteRows && listings.length > 0) {
      try {
        const activeArtifacteMints = await getActiveArtifacteMintSet();
        listings = listings.filter((listing) => {
          if (!isArtifacteOracleListing(listing)) return true;

          const mint = getOracleListingMint(listing);
          return mint !== null && activeArtifacteMints.has(mint);
        });
      } catch (e: any) {
        console.warn('[me-listings] Artifacte listing filter failed:', e?.message);
      }

      total = listings.length;
      const start = (requestedPage - 1) * requestedPerPage;
      listings = listings.slice(start, start + requestedPerPage);
    }

    // Enrich listings with Tensor USDC prices
    if (listings.length && process.env.HELIUS_API_KEY) {
      try {
        await enrichWithTensorPrices(listings);
      } catch (e: any) {
        console.warn('[me-listings] Tensor enrichment failed:', e?.message);
      }
    }

    const responsePayload: OracleListingsResponse = {
      ...data,
      listings,
      total,
    };

    if (filterArtifacteRows) {
      responsePayload.page = requestedPage;
      responsePayload.perPage = requestedPerPage;
      responsePayload.totalPages = Math.max(1, Math.ceil(total / requestedPerPage));
    }

    const response = NextResponse.json(responsePayload);
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
