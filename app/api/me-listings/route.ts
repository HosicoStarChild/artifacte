import { NextResponse } from 'next/server';
import { getActiveArtifacteMintSet } from '@/lib/artifacte-listings';
import { getOracleApiUrl } from '@/lib/server/oracle-env';

const ORACLE_API = getOracleApiUrl();
const REQUEST_TIMEOUT_MS = 12000;
const ARTIFACTE_MINT_CACHE_TTL = 30_000;
const ARTIFACTE_FILTER_REFILL_PAGES = 2;

export const maxDuration = 30;

type OracleListing = {
  id?: string;
  nftAddress?: string;
  source?: string;
  marketplace?: string;
  verifiedBy?: string;
  [key: string]: unknown;
};

type OracleListingsResponse = {
  listings?: OracleListing[];
  total?: number;
  page?: number;
  perPage?: number;
  totalPages?: number;
  [key: string]: unknown;
};

const FORWARDED_QUERY_KEYS = [
  'category',
  'ccCategory',
  'grade',
  'currency',
  'displayCurrency',
  'q',
  'sort',
  'page',
  'perPage',
  'rarity',
  'language',
  'sport',
  'brand',
  'spiritType',
  'source',
] as const;

let activeArtifacteMintSetCache: { ts: number; value: Set<string> } | null = null;

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

async function getCachedActiveArtifacteMintSet(): Promise<Set<string>> {
  if (activeArtifacteMintSetCache && Date.now() - activeArtifacteMintSetCache.ts < ARTIFACTE_MINT_CACHE_TTL) {
    return activeArtifacteMintSetCache.value;
  }

  const value = await getActiveArtifacteMintSet();
  activeArtifacteMintSetCache = { ts: Date.now(), value };
  return value;
}

async function fetchOracleListings(params: URLSearchParams): Promise<OracleListingsResponse> {
  const response = await fetch(`${ORACLE_API}/api/listings?${params.toString()}`, {
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    cache: 'no-store',
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload?.error || payload?.message || `Oracle returned ${response.status}`);
  }

  return payload as OracleListingsResponse;
}

function filterInactiveArtifacteRows(listings: OracleListing[], activeArtifacteMints: Set<string>) {
  let filteredOut = 0;

  const filtered = listings.filter((listing) => {
    if (!isArtifacteOracleListing(listing)) return true;

    const mint = getOracleListingMint(listing);
    const keep = mint !== null && activeArtifacteMints.has(mint);
    if (!keep) filteredOut += 1;
    return keep;
  });

  return { filtered, filteredOut };
}

async function refillArtifacteFilteredPage(
  baseParams: URLSearchParams,
  initialListings: OracleListing[],
  requestedPage: number,
  requestedPerPage: number,
  totalPages: number,
  activeArtifacteMints: Set<string>
): Promise<{ listings: OracleListing[]; filteredOut: number }> {
  const initialResult = filterInactiveArtifacteRows(initialListings, activeArtifacteMints);
  if (initialResult.filtered.length >= requestedPerPage || totalPages <= requestedPage) {
    return {
      listings: initialResult.filtered.slice(0, requestedPerPage),
      filteredOut: initialResult.filteredOut,
    };
  }

  const listings = [...initialResult.filtered];
  let filteredOut = initialResult.filteredOut;
  let nextPage = requestedPage + 1;
  let remainingRefills = ARTIFACTE_FILTER_REFILL_PAGES;

  while (listings.length < requestedPerPage && nextPage <= totalPages && remainingRefills > 0) {
    const refillParams = new URLSearchParams(baseParams.toString());
    refillParams.set('page', String(nextPage));
    const refillData = await fetchOracleListings(refillParams);
    const refillListings = Array.isArray(refillData.listings) ? refillData.listings : [];
    const refillResult = filterInactiveArtifacteRows(refillListings, activeArtifacteMints);
    listings.push(...refillResult.filtered);
    filteredOut += refillResult.filteredOut;
    nextPage += 1;
    remainingRefills -= 1;
  }

  return { listings: listings.slice(0, requestedPerPage), filteredOut };
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const category = searchParams.get('category');
  const requestedPage = parsePositiveInt(searchParams.get('page'), 1);
  const requestedPerPage = Math.min(100, Math.max(1, parsePositiveInt(searchParams.get('perPage'), 24)));
  const params = new URLSearchParams();

  for (const key of FORWARDED_QUERY_KEYS) {
    const value = searchParams.get(key);
    if (value) params.set(key, value);
  }

  params.set('page', String(requestedPage));
  params.set('perPage', String(requestedPerPage));

  try {
    const data = await fetchOracleListings(params);
    let listings = Array.isArray(data.listings) ? data.listings : [];
    let total = typeof data.total === 'number' ? data.total : listings.length;
    const totalPages = Math.max(1, typeof data.totalPages === 'number' ? data.totalPages : Math.ceil(total / requestedPerPage));

    if (shouldFilterArtifacteRows(category) && listings.some(isArtifacteOracleListing)) {
      try {
        const activeArtifacteMints = await getCachedActiveArtifacteMintSet();
        const refillResult = await refillArtifacteFilteredPage(
          params,
          listings,
          requestedPage,
          requestedPerPage,
          totalPages,
          activeArtifacteMints
        );

        listings = refillResult.listings;
        total = Math.max(listings.length, total - refillResult.filteredOut);
      } catch (error: any) {
        console.warn('[me-listings] Artifacte listing filter failed:', error?.message);
      }
    }

    const responsePayload: OracleListingsResponse = {
      ...data,
      listings,
      total,
      page: requestedPage,
      perPage: requestedPerPage,
      totalPages: Math.max(1, Math.ceil(total / requestedPerPage)),
    };

    const response = NextResponse.json(responsePayload);
    response.headers.set('Cache-Control', 'public, s-maxage=10, stale-while-revalidate=30');
    return response;
  } catch (error: any) {
    console.error('Listings proxy error:', error?.message);
    return NextResponse.json(
      { error: 'Failed to fetch listings', message: error?.message },
      { status: 500 }
    );
  }
}