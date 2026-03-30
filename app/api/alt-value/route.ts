import { NextRequest, NextResponse } from 'next/server';

/**
 * Alt.xyz graded card value lookup via Typesense
 * Query: ?name=Crown Zenith Bede #124&grade=PSA-9
 * Returns: { altValue, name, grade, price }
 */

const TYPESENSE_HOST = 'https://tlzfv6xaq81nhsbyp.a1.typesense.net:443';
const COLLECTION = 'production_universal_search';

// Rate limit: 30/min/IP
const rateMap = new Map<string, { count: number; reset: number }>();
function checkRate(ip: string): boolean {
  const now = Date.now();
  const e = rateMap.get(ip);
  if (!e || now > e.reset) { rateMap.set(ip, { count: 1, reset: now + 60000 }); return true; }
  if (e.count >= 30) return false;
  e.count++;
  return true;
}

// Cache Typesense API key (refreshed hourly from alt.xyz GraphQL)
let cachedKey = '';
let keyExpiry = 0;

async function getApiKey(): Promise<string> {
  if (cachedKey && Date.now() < keyExpiry) return cachedKey;
  try {
    const r = await fetch('https://alt-platform-server.production.internal.onlyalt.com/graphql/SearchServiceConfig', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: 'query{serviceConfig{search{universalSearch{clientConfig{apiKey}}}}}' }),
      signal: AbortSignal.timeout(5000),
    });
    const d = await r.json();
    cachedKey = d.data?.serviceConfig?.search?.universalSearch?.clientConfig?.apiKey || '';
    keyExpiry = Date.now() + 3600000; // 1 hour
    return cachedKey;
  } catch {
    return cachedKey; // use stale key
  }
}

export async function GET(req: NextRequest) {
  const ip = req.headers.get('x-forwarded-for') || 'unknown';
  if (!checkRate(ip)) return NextResponse.json({ error: 'Rate limit' }, { status: 429 });

  const name = req.nextUrl.searchParams.get('name');
  const grade = req.nextUrl.searchParams.get('grade'); // e.g. PSA-9, CGC-10
  if (!name) return NextResponse.json({ error: 'Missing name' }, { status: 400 });

  try {
    const apiKey = await getApiKey();
    if (!apiKey) return NextResponse.json({ error: 'Alt.xyz unavailable' }, { status: 502 });

    const q = name + (grade ? ' ' + grade.replace('-', ' ') : '');
    const filterBy = grade ? `gradeKey:=${grade}` : '';

    const r = await fetch(`${TYPESENSE_HOST}/multi_search?collection=${COLLECTION}&use_cache=true`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-TYPESENSE-API-KEY': apiKey },
      body: JSON.stringify({
        searches: [{
          q,
          query_by: '*',
          ...(filterBy ? { filter_by: filterBy } : {}),
          per_page: 1,
          page: 1,
        }],
      }),
      signal: AbortSignal.timeout(8000),
    });

    const d = await r.json();
    const hit = d.results?.[0]?.hits?.[0]?.document;

    if (!hit) {
      // Retry without grade filter
      if (filterBy) {
        const r2 = await fetch(`${TYPESENSE_HOST}/multi_search?collection=${COLLECTION}&use_cache=true`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-TYPESENSE-API-KEY': apiKey },
          body: JSON.stringify({ searches: [{ q, query_by: '*', per_page: 1, page: 1 }] }),
          signal: AbortSignal.timeout(8000),
        });
        const d2 = await r2.json();
        const hit2 = d2.results?.[0]?.hits?.[0]?.document;
        if (hit2) {
          return NextResponse.json({
            altValue: hit2.altValue,
            name: hit2.name,
            grade: hit2.gradeKey,
            price: hit2.price,
          });
        }
      }
      return NextResponse.json({ altValue: null });
    }

    return NextResponse.json({
      altValue: hit.altValue,
      name: hit.name,
      grade: hit.gradeKey,
      price: hit.price,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
