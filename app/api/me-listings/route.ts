import { NextResponse } from 'next/server';

const ME_API = 'https://api-mainnet.magiceden.dev/v2';
const CC_API = 'https://api.collectorcrypt.com/marketplace';
const COLLECTION = 'collector_crypt';
const PAGE_SIZE = 20;
const MARKUP = 1.05; // 5% markup
const CACHE_TTL = 5 * 60 * 1000; // 5 min
const PARALLEL = 10;
const ROUND_DELAY = 300;

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

// ─── ME Transform ────────────────────────────────────────

function transformMEListing(item: any) {
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

// ─── CC Transform ────────────────────────────────────────

function fixCcCategory(name: string, originalCat: string): string {
  const lower = name.toLowerCase();
  if (
    lower.includes('one piece') ||
    /\bop\d{2}[-\s]/i.test(lower) ||
    (/\bst[012]\d[-\s]/i.test(lower) && (lower.includes('luffy') || lower.includes('zoro') || lower.includes('nami')))
  ) {
    return 'One Piece';
  }
  return originalCat;
}

function transformCCListing(item: any) {
  const l = item.listing;
  if (!l) return null;

  const basePrice = l.price;
  const currency = l.currency || 'USDC';

  // Skip SOL listings — those come from ME with full metadata
  if (currency === 'SOL') return null;

  const markupPrice = Math.ceil(basePrice * MARKUP * 100) / 100;
  const correctedCategory = fixCcCategory(item.itemName || '', item.category || '');
  const category = categoryMap[correctedCategory] || 'TCG_CARDS';

  const gradingCompany = item.gradingCompany || '';
  const gradeNum = item.gradeNum;
  const vault = item.vault || '';
  const image = item.images?.front || item.frontImage || '';

  return {
    id: `cc-${item.id}`,
    name: item.itemName || 'Unknown',
    subtitle: `${correctedCategory} • ${gradingCompany} ${gradeNum || ''} • ${vault ? (vault.toLowerCase().includes('vault') ? vault : vault + ' Vault') : 'Vault'}`.trim(),
    price: markupPrice,
    image,
    category,
    verifiedBy: gradingCompany || 'Collector Crypt',
    source: 'collector-crypt',
    currency: 'USDC',
    ccPrice: basePrice,
    nftAddress: item.nftAddress || '',
    grade: item.grade || '',
    gradeNum: gradeNum ? parseFloat(String(gradeNum)) : undefined,
    gradingCompany,
    vault,
    year: item.year ? parseInt(String(item.year)) : undefined,
    ccCategory: correctedCategory,
    ccId: item.id,
    insuredValue: item.insuredValue ? parseFloat(String(item.insuredValue)) : undefined,
    ccUrl: item.nftAddress ? `https://collectorcrypt.com/marketplace/${item.nftAddress}` : undefined,
  };
}

// ─── Fetchers ────────────────────────────────────────────

async function fetchMEPage(offset: number): Promise<any[]> {
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
    const batches = await Promise.all(offsets.map(fetchMEPage));

    let roundItems = 0;
    let lastBatchShort = false;
    for (const batch of batches) {
      if (!Array.isArray(batch)) continue;
      for (const item of batch) {
        if (item.token?.image && item.price > 0) {
          all.push(transformMEListing(item));
          roundItems++;
        }
      }
      if (batch.length < PAGE_SIZE) lastBatchShort = true;
    }

    if (roundItems === 0) {
      emptyRounds++;
      if (emptyRounds >= 2) break;
    } else {
      emptyRounds = 0;
    }

    if (lastBatchShort && roundItems > 0) break;
    offset += PARALLEL * PAGE_SIZE;
    await new Promise(r => setTimeout(r, ROUND_DELAY));
  }

  return all;
}

async function fetchAllFromCC(): Promise<any[]> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 25000); // 25s max

    const res = await fetch(CC_API, { signal: controller.signal });
    clearTimeout(timeout);

    if (!res.ok) return [];
    const data = await res.json();
    const allItems = data.filterNFtCard || [];
    const listed = allItems.filter((i: any) => i.listing);

    const transformed: any[] = [];
    for (const item of listed) {
      const t = transformCCListing(item);
      if (t && t.image) transformed.push(t);
    }
    return transformed;
  } catch (err) {
    console.error('CC API fetch failed:', err);
    return [];
  }
}

// ─── Combined fetch ──────────────────────────────────────

async function fetchAll(): Promise<any[]> {
  // Fetch ME (SOL listings) and CC (USDC listings) in parallel
  const [meListings, ccListings] = await Promise.all([
    fetchAllFromME(),
    fetchAllFromCC(),
  ]);

  // Dedup: CC USDC items that also exist on ME (by ccId)
  const meIds = new Set(meListings.map(l => l.ccId));
  const uniqueCC = ccListings.filter(l => !meIds.has(l.ccId));

  const combined = [...meListings, ...uniqueCC];
  console.log(`Fetched ${meListings.length} from ME + ${uniqueCC.length} USDC-only from CC = ${combined.length} total`);

  return combined;
}

async function getListings(): Promise<any[]> {
  const now = Date.now();
  if (cachedListings && (now - cacheTimestamp) < CACHE_TTL) {
    return cachedListings;
  }

  if (fetchPromise) return fetchPromise;

  fetchPromise = fetchAll().then(listings => {
    cachedListings = listings;
    cacheTimestamp = Date.now();
    fetchPromise = null;
    return listings;
  }).catch(err => {
    fetchPromise = null;
    if (cachedListings) return cachedListings;
    throw err;
  });

  return fetchPromise;
}

// ─── Handler ─────────────────────────────────────────────

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const category = searchParams.get('category');
  const ccCat = searchParams.get('ccCategory');
  const gradeFilter = searchParams.get('grade');
  const currencyFilter = searchParams.get('currency');
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
    if (currencyFilter) {
      results = results.filter((l: any) => l.currency === currencyFilter);
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
    console.error('Listings error:', err?.message || err);
    return NextResponse.json(
      { error: 'Failed to fetch listings', message: err?.message },
      { status: 500 }
    );
  }
}

export const maxDuration = 60;
