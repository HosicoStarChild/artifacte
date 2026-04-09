import { NextResponse } from 'next/server';

/**
 * POST /api/listing-notify
 * Called after a successful Tensor listing TX to immediately push the NFT into the Oracle index.
 * Body: { mint: string }
 */
export async function POST(request: Request) {
  try {
    const { mint } = await request.json();
    if (!mint) return NextResponse.json({ error: 'Missing mint' }, { status: 400 });

    const ORACLE_URL = process.env.ORACLE_URL || 'https://artifacte-oracle-production.up.railway.app';
    const ADMIN_TOKEN = process.env.ORACLE_ADMIN_TOKEN;

    if (!ADMIN_TOKEN) {
      console.warn('[listing-notify] No ORACLE_ADMIN_TOKEN set — skipping');
      return NextResponse.json({ ok: true, skipped: true });
    }

    const res = await fetch(`${ORACLE_URL}/api/listings/push`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${ADMIN_TOKEN}`,
      },
      body: JSON.stringify({ mint }),
    });

    const data = await res.json();
    return NextResponse.json({ ok: true, ...data });
  } catch (err: any) {
    console.error('[listing-notify] Error:', err.message);
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}
