import { NextResponse } from 'next/server';

const ME_API = 'https://api-mainnet.magiceden.dev/v2';
const COLLECTION = 'collector_crypt';
const PAGE_SIZE = 20;
const MARKUP = 1.05; // 5% markup
const CACHE_TTL = 5 * 60 * 1000; // 5 min
const PARALLEL = 10; // 10 concurrent ME requests per round
const ROUND_DELAY = 300; // ms between rounds

// In-memory cache
let cachedListings: any[] | null = null;
let cacheTimestamp = 0;
let fetchPromise: Promise<any[]> | null = null;

const categoryMap: Record<string, string> = {
  'Pokemon': 'TCG_CARDS',
  'One Piece': 'TCG_CARDS',
  'Yu-Gi-Oh': 'TCG_CARDS',
  'Yu-Gi-Oh!': 'TCG_CARDS',
  'Magic: The Gathering': 'TCG_CARDS',
  'Dragon Ball Z': 'TCG_CARDS',
  'Dragon Ball Super': 'TCG_CARDS',
  'Lorcana': 'TCG_CARDS',
  'Baseball': 'SPORTS_CARDS',
  'Basketball': 'SPORTS_CARDS',
  'Football': 'SPORTS_CARDS',
  'Soccer': 'SPORTS_CARDS',
  'Hockey': 'SPORTS_CARDS',
  'UFC': 'SPORTS_CARDS',
};

function getAttr(attrs: { trait_type: string; value: string }[], key: string): string | undefined {
  return attrs.find(a => a.trait_type === key)?.value;
}

function transformListing(item: any) {
  const attrs = item.token?.attributes || [];
  const ccCategory = getAttr(attrs, 'Category') || '';
  const gradingCompany = getAttr(attrs, 'Grading Company') || '';
  const gradeNum = getAttr(attrs, 'GradeNum');
  const grade = getAttr(attrs, 'The Grade') || '';
  const vault = getAttr(attrs, 'Vault') || '';
  const year = getAttr(attrs, 'Year');
  const insuredValue = getAttr(attrs, 'Insured Value');
  const ccId = getAttr(attrs, 'Collector Crypt ID') || item.tokenMint;
  const location = getAttr(attrs, 'Location') || '';
  const category = categoryMap[ccCategory] || 'TCG_CARDS';

  const solPrice = item.price;
  const markupPrice = Math.round(solPrice * MARKUP * 10000) / 10000;

  return {
    id: `cc-${ccId}`,
    name: item.token?.name || 'Unknown',
    subtitle: `${ccCategory} • ${gradingCompany} ${gradeNum || ''} • ${vault ? (vault.toLowerCase().includes('vault') ? vault : vault + ' Vault') : 'Vault'}`.trim(),
    price: markupPrice,
    image: item.token?.image || '',
    category,
    verifiedBy: gradingCompany || 'Collector Crypt',
    source: 'collector-crypt',
    currency: 'SOL',
    ccPrice: solPrice,
    nftAddress: item.token?.mintAddress || item.tokenMint,
    grade,
    gradeNum: gradeNum ? parseFloat(gradeNum) : undefined,
    gradingCompany,
    vault,
    vaultLocation: location,
    year: year ? parseInt(year) : undefined,
    ccCategory,
    ccId,
    insuredValue: insuredValue ? parseFloat(insuredValue) : undefined,
    seller: item.seller,
  };
}

async function fetchPage(offset: number): Promise<any[]> {
  try {
    const res = await fetch(
      `${ME_API}/collections/${COLLECTION}/listings?offset=${offset}&limit=${PAGE_SIZE}`
    );
    if (!res.ok) return [];
    return res.json();
  } catch {
    return [];
  }
}

async function fetchAllFromME(): Promise<any[]> {
  const all: any[] = [];
  let offset = 0;
  let emptyRounds = 0;

  while (offset < 15000) {
    const offsets = Array.from({ length: PARALLEL }, (_, i) => offset + i * PAGE_SIZE);
    const batches = await Promise.all(offsets.map(fetchPage));

    let roundItems = 0;
    let lastBatchShort = false;
    for (const batch of batches) {
      if (!Array.isArray(batch)) continue;
      for (const item of batch) {
        if (item.token?.image && item.price > 0) {
          all.push(transformListing(item));
          roundItems++;
        }
      }
      if (batch.length < PAGE_SIZE) lastBatchShort = true;
    }

    if (roundItems === 0) {
      emptyRounds++;
      if (emptyRounds >= 2) break; // 2 consecutive empty rounds = done
    } else {
      emptyRounds = 0;
    }

    // If the last batch in the round was short, we've reached the end
    if (lastBatchShort && roundItems > 0) break;

    offset += PARALLEL * PAGE_SIZE;
    await new Promise(r => setTimeout(r, ROUND_DELAY));
  }

  return all;
}

async function getListings(): Promise<any[]> {
  const now = Date.now();
  if (cachedListings && (now - cacheTimestamp) < CACHE_TTL) {
    return cachedListings;
  }

  // Dedup concurrent fetches
  if (fetchPromise) return fetchPromise;

  fetchPromise = fetchAllFromME().then(listings => {
    cachedListings = listings;
    cacheTimestamp = Date.now();
    fetchPromise = null;
    return listings;
  }).catch(err => {
    fetchPromise = null;
    if (cachedListings) return cachedListings; // serve stale on error
    throw err;
  });

  return fetchPromise;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const category = searchParams.get('category');
  const ccCat = searchParams.get('ccCategory');
  const gradeFilter = searchParams.get('grade');
  const search = searchParams.get('q');
  const page = parseInt(searchParams.get('page') || '1');
  const perPage = parseInt(searchParams.get('perPage') || '24');
  const sort = searchParams.get('sort') || 'price-desc';

  try {
    let results = await getListings();

    if (category) {
      results = results.filter((l: any) => l.category === category);
    }
    if (ccCat) {
      const cats = ccCat.split(',');
      results = results.filter((l: any) => cats.includes(l.ccCategory));
    }
    if (gradeFilter) {
      if (gradeFilter.includes(' ')) {
        const [co, num] = gradeFilter.split(' ');
        results = results.filter((l: any) => l.gradingCompany === co && String(l.gradeNum) === num);
      } else {
        results = results.filter((l: any) => String(l.gradeNum) === gradeFilter);
      }
    }
    if (search) {
      const q = search.toLowerCase();
      results = results.filter((l: any) => l.name.toLowerCase().includes(q));
    }

    switch (sort) {
      case 'price-asc':
        results.sort((a: any, b: any) => a.price - b.price);
        break;
      case 'newest':
        break;
      case 'price-desc':
      default:
        results.sort((a: any, b: any) => b.price - a.price);
        break;
    }

    const total = results.length;
    const start = (page - 1) * perPage;
    const paginated = results.slice(start, start + perPage);

    const response = NextResponse.json({
      listings: paginated,
      total,
      page,
      perPage,
      totalPages: Math.ceil(total / perPage),
    });

    response.headers.set('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=60');

    return response;
  } catch (err: any) {
    console.error('ME listings error:', err?.message || err);
    return NextResponse.json(
      { error: 'Failed to fetch listings', message: err?.message },
      { status: 500 }
    );
  }
}

export const maxDuration = 60; // Allow up to 60s for cold-start full fetch
