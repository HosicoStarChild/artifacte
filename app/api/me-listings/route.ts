import { NextResponse } from 'next/server';
import {
  loadActiveArtifacteFixedPriceListings,
  type ArtifacteProgramListing,
} from '@/lib/artifacte-listings';
import { buildNftImageFallbackPath } from '@/lib/helius-asset-image';
import { getOracleApiUrl } from '@/lib/server/oracle-env';

const ORACLE_API = getOracleApiUrl();
const REQUEST_TIMEOUT_MS = 12000;
const ARTIFACTE_FILTER_REFILL_PAGES = 2;

export const maxDuration = 30;

type OracleListing = {
  id?: string;
  image?: string;
  name?: string;
  nftAddress?: string;
  price?: number;
  seller?: string;
  source?: string;
  subtitle?: string;
  currency?: string;
  usdcPrice?: number;
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

function getOracleRequestErrorMessage(error: unknown): string {
  if (!(error instanceof Error)) {
    return String(error);
  }

  const cause = error.cause;
  const causeCode =
    typeof cause === 'object' && cause !== null && 'code' in cause && typeof cause.code === 'string'
      ? cause.code
      : null;

  if (
    error.name === 'AbortError' ||
    error.name === 'TimeoutError' ||
    causeCode === 'UND_ERR_CONNECT_TIMEOUT' ||
    causeCode === 'UND_ERR_HEADERS_TIMEOUT'
  ) {
    return `oracle request timed out after ${REQUEST_TIMEOUT_MS}ms`;
  }

  if (causeCode === 'ECONNREFUSED' || causeCode === 'ENOTFOUND' || causeCode === 'EHOSTUNREACH') {
    return `oracle network failure (${causeCode})`;
  }

  return causeCode ? `${error.message} (${causeCode})` : error.message;
}

function parsePositiveInt(value: string | null, fallback: number): number {
  const parsed = Number.parseInt(value || '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function shouldFilterArtifacteRows(category: string | null): boolean {
  return category === 'TCG_CARDS' && Boolean(process.env.HELIUS_API_KEY);
}

function shouldServeFreshArtifacteListings(category: string | null, source: string | null): boolean {
  // No category = single-asset card detail lookup; always serve fresh.
  if (!category) return true;
  return category === 'TCG_CARDS' && (!source || source === 'artifacte');
}

function shouldFilterBaxusRows(category: string | null): boolean {
  return category !== 'SPIRITS';
}

function matchesNormalizedValue(value: unknown, target: string): boolean {
  return typeof value === 'string' && value.trim().toLowerCase() === target;
}

function isBaxusOracleListing(listing: OracleListing): boolean {
  return (
    matchesNormalizedValue(listing.source, 'baxus') ||
    matchesNormalizedValue(listing.marketplace, 'baxus') ||
    matchesNormalizedValue(listing.verifiedBy, 'baxus')
  );
}

function isArtifacteOracleListing(listing: OracleListing): boolean {
  return listing.source === 'artifacte' || listing.marketplace === 'artifacte' || listing.verifiedBy === 'Artifacte';
}

function getOracleListingMint(listing: OracleListing): string | null {
  if (typeof listing.nftAddress === 'string' && listing.nftAddress) return listing.nftAddress;
  if (typeof listing.id === 'string' && listing.id) return listing.id;
  return null;
}

function isLikelySolanaAddress(value: string): boolean {
  return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(value);
}

function shouldUseHeliusListingImage(listing: OracleListing, requestedCategory: string | null): boolean {
  const category = typeof listing.category === 'string' ? listing.category : requestedCategory;
  return category !== 'DIGITAL_ART';
}

function preferHeliusListingImages(listings: OracleListing[], requestedCategory: string | null): OracleListing[] {
  return listings.map((listing) => {
    if (!shouldUseHeliusListingImage(listing, requestedCategory)) {
      return listing;
    }

    const mint = getOracleListingMint(listing);
    if (!mint) {
      return listing;
    }

    if (!isLikelySolanaAddress(mint)) {
      return listing;
    }

    return {
      ...listing,
      image: buildNftImageFallbackPath(mint),
    };
  });
}

function mergeArtifacteListingSnapshots(
  listings: OracleListing[],
  activeArtifacteListings: readonly ArtifacteProgramListing[],
): OracleListing[] {
  const activeArtifacteListingsByMint = new Map<string, ArtifacteProgramListing>();

  for (const listing of activeArtifacteListings) {
    activeArtifacteListingsByMint.set(listing.nftAddress, listing);
  }

  return listings.map((listing) => {
    if (!isArtifacteOracleListing(listing)) {
      return listing;
    }

    const mint = getOracleListingMint(listing);
    if (!mint) {
      return listing;
    }

    const activeListing = activeArtifacteListingsByMint.get(mint);
    if (!activeListing) {
      return listing;
    }

    return {
      ...listing,
      currency: activeListing.currency,
      id: typeof listing.id === 'string' && listing.id ? listing.id : activeListing.id,
      image: typeof listing.image === 'string' && listing.image.trim() ? listing.image : activeListing.image,
      marketplace: activeListing.marketplace,
      name: typeof listing.name === 'string' && listing.name.trim() ? listing.name : activeListing.name,
      nftAddress: activeListing.nftAddress,
      price: activeListing.price,
      seller: activeListing.seller,
      source: activeListing.source,
      subtitle: typeof listing.subtitle === 'string' && listing.subtitle.trim()
        ? listing.subtitle
        : activeListing.subtitle,
      usdcPrice: activeListing.usdcPrice,
      verifiedBy: typeof listing.verifiedBy === 'string' && listing.verifiedBy.trim()
        ? listing.verifiedBy
        : 'Artifacte',
    };
  });
}

async function fetchOracleListings(params: URLSearchParams): Promise<OracleListingsResponse> {
  const upstreamUrl = `${ORACLE_API}/api/listings?${params.toString()}`;
  let response: Response;

  try {
    response = await fetch(upstreamUrl, {
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      cache: 'no-store',
    });
  } catch (error: unknown) {
    throw new Error(`Unable to reach oracle upstream: ${getOracleRequestErrorMessage(error)}`, {
      cause: error,
    });
  }

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(
      `Oracle responded with ${response.status}: ${payload?.error || payload?.message || 'unexpected response'}`
    );
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

function filterBaxusRows(listings: OracleListing[]) {
  let filteredOut = 0;

  const filtered = listings.filter((listing) => {
    const keep = !isBaxusOracleListing(listing);
    if (!keep) filteredOut += 1;
    return keep;
  });

  return { filtered, filteredOut };
}

async function refillBaxusFilteredPage(
  baseParams: URLSearchParams,
  initialListings: OracleListing[],
  requestedPage: number,
  requestedPerPage: number,
  totalPages: number
): Promise<{ listings: OracleListing[]; filteredOut: number }> {
  const initialResult = filterBaxusRows(initialListings);
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
    const refillResult = filterBaxusRows(refillListings);
    listings.push(...refillResult.filtered);
    filteredOut += refillResult.filteredOut;
    nextPage += 1;
    remainingRefills -= 1;
  }

  return { listings: listings.slice(0, requestedPerPage), filteredOut };
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
  const source = searchParams.get('source');
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
        const activeArtifacteListings = await loadActiveArtifacteFixedPriceListings();
        const activeArtifacteMints = new Set(activeArtifacteListings.map((listing) => listing.nftAddress));
        const refillResult = await refillArtifacteFilteredPage(
          params,
          listings,
          requestedPage,
          requestedPerPage,
          totalPages,
          activeArtifacteMints
        );

        listings = mergeArtifacteListingSnapshots(refillResult.listings, activeArtifacteListings);
        total = Math.max(listings.length, total - refillResult.filteredOut);
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        console.warn('[me-listings] Artifacte listing filter failed:', message);
      }
    }

    if (shouldFilterBaxusRows(category)) {
      const baxusFilterResult = await refillBaxusFilteredPage(
        params,
        listings,
        requestedPage,
        requestedPerPage,
        totalPages
      );
      listings = baxusFilterResult.listings;
      total = Math.max(listings.length, total - baxusFilterResult.filteredOut);
    }

    const responsePayload: OracleListingsResponse = {
      ...data,
      listings: preferHeliusListingImages(listings, category),
      total,
      page: requestedPage,
      perPage: requestedPerPage,
      totalPages: Math.max(1, Math.ceil(total / requestedPerPage)),
    };

    const response = NextResponse.json(responsePayload);
    response.headers.set(
      'Cache-Control',
      shouldServeFreshArtifacteListings(category, source)
        ? 'no-store'
        : 'public, s-maxage=10, stale-while-revalidate=30'
    );
    return response;
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[me-listings] Listings proxy error:', {
      upstream: ORACLE_API,
      query: params.toString(),
      message,
    });
    return NextResponse.json(
      { error: 'Failed to fetch listings', message },
      { status: 500 }
    );
  }
}
