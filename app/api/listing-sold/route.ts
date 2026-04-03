import { NextResponse } from 'next/server';

/**
 * POST /api/listing-sold
 * Called after a confirmed buy to immediately remove the listing from the oracle.
 * Body: { mint: string }
 */
export async function POST(request: Request) {
  try {
    const { mint } = await request.json();
    if (!mint) return NextResponse.json({ error: 'Missing mint' }, { status: 400 });

    const ORACLE_URL = process.env.ORACLE_URL || 'https://artifacte-oracle-production.up.railway.app';
    const ADMIN_TOKEN = process.env.ORACLE_ADMIN_TOKEN;

    if (!ADMIN_TOKEN) {
      console.warn('[listing-sold] No ORACLE_ADMIN_TOKEN set — skipping oracle removal');
      return NextResponse.json({ ok: true, skipped: true });
    }

    const res = await fetch(`${ORACLE_URL}/api/listings/${mint}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${ADMIN_TOKEN}` },
    });

    const data = await res.json();
    return NextResponse.json({ ok: true, ...data });
  } catch (err: any) {
    console.error('[listing-sold] Error:', err.message);
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}
