import { NextResponse } from 'next/server';

// Proxy to Railway oracle listings index — fast, pre-indexed, real-time via webhooks
const ORACLE_API = 'https://artifacte-oracle-production.up.railway.app';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);

  // Forward all query params to Railway
  const params = new URLSearchParams();
  for (const [key, value] of searchParams.entries()) {
    // Map 'q' search param
    params.set(key, value);
  }

  try {
    const res = await fetch(`${ORACLE_API}/api/listings?${params}`, {
      signal: AbortSignal.timeout(15000),
      cache: 'no-store', // Don't cache — Railway is fast, each request has unique filters
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

export const maxDuration = 30;
