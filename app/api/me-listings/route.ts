import { NextResponse } from 'next/server';

// Proxy to Railway oracle listings index — fast, pre-indexed, real-time via webhooks
const ORACLE_API = 'https://artifacte-oracle-production.up.railway.app';
// ME API no longer needed here — phygitals indexed in oracle

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const category = searchParams.get('category');

  // Phygitals are now indexed in the oracle — no separate fetch needed

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



export const maxDuration = 30;
