// On-chain program constants
export const AUCTION_PROGRAM_ID = "23fKEH3emeaJf1PW4Kts3exRnMjoNiqmqyFoNXH6qNiN";
export const RWA_NFT_PROGRAM_ID = "F9mkXqMrgF1sSV3wDtTUpTs82B5XJ5qz9A33nBAdcNqb";
export const TREASURY_WALLET = "6drXw31FjHch4ixXa4ngTyUD2cySUs3mpcB2YYGA9g7P";
export const ADMIN_WALLET = "DDSpvAK8DbuAdEaaBHkfLieLPSJVCWWgquFAA3pvxXoX";
export const ARTIFACTE_COLLECTION = "jzkJTGAuDcWthM91S1ch7wPcfMUQB5CdYH6hA25K4CS";
export const USD1_MINT = "USD1ttGY1N17NEEHLmELoaybftRBUSErhqYiQzvEmuB";
export const USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";

// BAXUS 10% seller fee — hardcoded until they migrate to Metaplex standard
// Set to false to disable once BAXUS has royalties on-chain
export const BAXUS_SELLER_FEE_ENABLED = true;
export const BAXUS_SELLER_FEE_PERCENT = 10;

export type Category = 
  | "REAL_ESTATE" | "DIGITAL_ART" | "AGRICULTURE" 
  | "AVIATION" | "PRECIOUS_METALS" | "LUXURY" | "SPIRITS"
  | "TCG_CARDS" | "SPORTS_CARDS" | "WATCHES" | "SEALED" | "MERCHANDISE"
  | "PHYGITALS";

export interface Asset {
  id: string;
  slug: string;
  name: string;
  category: Category;
  description: string;
  appraised_value: number;
  condition_grade: string;
  image: string;
  highDemand?: boolean;
}

export interface Auction {
  id: string;
  slug: string;
  name: string;
  subtitle: string;
  category: Category;
  current_bid: number;
  start_price: number;
  end_time: string;
  image: string;
  bids: Bid[];
  description: string;
  verifiedBy?: string;
}

export interface Bid {
  bidder: string;
  amount: number;
  time: string;
}

export interface Listing {
  id: string;
  name: string;
  subtitle: string;
  price: number;
  image: string;
  category?: Category;
  nftMint?: string;
  verifiedBy?: string;
  source?: 'baxus' | 'native' | 'collector-crypt';
  externalUrl?: string;
  // BAXUS-specific fields
  abv?: number | null;
  age?: number | null;
  country?: string | null;
  region?: string | null;
  volume_ml?: number | null;
  spirit_type?: string;
  // Collector Crypt fields
  currency?: string; // SOL or USDC
  ccPrice?: number; // original CC price before markup
  nftAddress?: string;
  grade?: string;
  gradeNum?: number;
  gradingCompany?: string;
  vault?: string;
  set?: string;
  year?: number;
  ccCategory?: string; // original CC category (Pokemon, One Piece, etc.)
  ccUrl?: string;
}

const now = Date.now();
const day = 86400000;

// CC listings now served live from Railway oracle — no static bundle
let ccListings: any[] = [];

// Load BAXUS bottles data
let baxusBottles: any[] = [];
try {
  // This will be loaded at build time via bundler
  const baxusData = require('../data/baxus-bottles.json');
  baxusBottles = baxusData.bottles || [];
} catch (err) {
  console.warn('Could not load BAXUS bottles data:', err instanceof Error ? err.message : String(err));
}

export const assets: Asset[] = [
  {
    id: "1", slug: "azure-bay-residence", name: "Azure Bay Residence",
    category: "REAL_ESTATE", description: "Premium waterfront property in Dubai Marina with panoramic sea views. Fully furnished luxury residence spanning 4,200 sq ft.",
    appraised_value: 2500000, condition_grade: "A+",
    image: "https://images.unsplash.com/photo-1613490493576-7fde63acd811?w=800",
  },
  {
    id: "2", slug: "heritage-tower", name: "Heritage Tower",
    category: "REAL_ESTATE", description: "Iconic commercial tower in Manhattan financial district. 42 floors of Grade A office space with 98% occupancy rate.",
    appraised_value: 5000000, condition_grade: "A",
    image: "https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?w=800",
  },
  {
    id: "3", slug: "logistics-hub-nevada", name: "Logistics Hub Nevada",
    category: "REAL_ESTATE", description: "350,000 sq ft state-of-the-art logistics facility near Las Vegas. Long-term tenant with 15-year lease.",
    appraised_value: 1705000, condition_grade: "A",
    image: "https://images.unsplash.com/photo-1586528116311-ad8dd3c8310d?w=800", highDemand: true,
  },
  {
    id: "4", slug: "fine-art-collection-a", name: "Fine Art Collection A",
    category: "DIGITAL_ART", description: "Curated collection of 12 museum-quality contemporary artworks by emerging and established artists.",
    appraised_value: 248000, condition_grade: "Pristine",
    image: "https://images.unsplash.com/photo-1541961017774-22349e4a1262?w=800",
  },
  {
    id: "5", slug: "california-vineyard", name: "California Vineyard Estate",
    category: "AGRICULTURE", description: "120-acre premium vineyard in Napa Valley producing award-winning Cabernet Sauvignon. Includes winery facilities.",
    appraised_value: 1500000, condition_grade: "A+",
    image: "https://images.unsplash.com/photo-1506377247377-2a5b3b417ebb?w=800",
  },
  {
    id: "6", slug: "private-jet-fleet", name: "Private Jet Fleet",
    category: "AVIATION", description: "Fleet of 3 Gulfstream G650ER ultra-long-range business jets. Managed by certified aviation operator with full maintenance history.",
    appraised_value: 10000000, condition_grade: "A",
    image: "https://images.unsplash.com/photo-1540962351504-03099e0a754b?w=800",
  },
  {
    id: "7", slug: "gold-reserve-collection", name: "Gold Reserve Collection",
    category: "PRECIOUS_METALS", description: "500 troy ounces of LBMA-certified gold bars stored in secure Swiss vaults with full insurance coverage.",
    appraised_value: 1000000, condition_grade: "999.9 Fine",
    image: "https://images.unsplash.com/photo-1610375461246-83df859d849d?w=800", highDemand: true,
  },
  {
    id: "8", slug: "modern-art-masters", name: "Modern Art Masters",
    category: "DIGITAL_ART", description: "Exclusive collection featuring works from Basquiat, Haring, and contemporary digital artists. Gallery-verified provenance.",
    appraised_value: 370000, condition_grade: "Museum Grade",
    image: "https://images.unsplash.com/photo-1578301978693-85fa9c0320b9?w=800", highDemand: true,
  },
];

export const auctions: Auction[] = [
  {
    id: "a1", slug: "master-ultra-thin-calendar",
    name: "Master Ultra Thin Perpetual Calendar",
    subtitle: "LUXURY CHRONOGRAPH SERIES",
    category: "LUXURY", current_bid: 28400, start_price: 20000,
    end_time: new Date(now + 2 * day).toISOString(),
    image: "https://images.unsplash.com/photo-1523170335258-f5ed11844a49?w=800",
    description: "Jaeger-LeCoultre Master Ultra Thin Perpetual Calendar in rose gold. Complete set with box, papers, and service history. Reference 1302520.",
    bids: [
      { bidder: "7xK9...mP2q", amount: 28400, time: new Date(now - 3600000).toISOString() },
      { bidder: "3nR5...vL8w", amount: 26000, time: new Date(now - 7200000).toISOString() },
      { bidder: "9pT2...hJ4x", amount: 24500, time: new Date(now - 14400000).toISOString() },
      { bidder: "5mQ8...bN1y", amount: 22000, time: new Date(now - 28800000).toISOString() },
    ],
  },
  {
    id: "a2", slug: "vintage-porsche-911",
    name: "Vintage Porsche 911 Turbo",
    subtitle: "CLASSIC AUTOMOTIVE COLLECTION",
    category: "LUXURY", current_bid: 245000, start_price: 180000,
    end_time: new Date(now + 5 * day).toISOString(),
    image: "https://images.unsplash.com/photo-1503376780353-7e6692767b70?w=800",
    description: "1989 Porsche 911 Turbo (930) in Guards Red. Matching numbers, 42,000 original miles. Concours-quality restoration with documented history.",
    bids: [
      { bidder: "2kL7...qR9z", amount: 245000, time: new Date(now - 1800000).toISOString() },
      { bidder: "8wN3...tF6a", amount: 230000, time: new Date(now - 10800000).toISOString() },
      { bidder: "4jP1...xS5c", amount: 215000, time: new Date(now - 43200000).toISOString() },
    ],
  },
  {
    id: "a3", slug: "rare-whisky-cask",
    name: "Macallan 1990 Sherry Cask",
    subtitle: "RARE SPIRITS COLLECTION",
    verifiedBy: "BAXUS", category: "SPIRITS", current_bid: 98500, start_price: 65000,
    end_time: new Date(now + 3 * day).toISOString(),
    image: "https://images.unsplash.com/photo-1569529465841-dfecdab7503b?w=800",
    description: "Single cask Macallan 1990 vintage matured in first-fill Oloroso sherry butt. Cask #4567, yielding approximately 580 bottles. Stored in bonded warehouse.",
    bids: [
      { bidder: "6hM4...wK2d", amount: 98500, time: new Date(now - 5400000).toISOString() },
      { bidder: "1tR9...pV7e", amount: 92000, time: new Date(now - 21600000).toISOString() },
      { bidder: "7xK9...mP2q", amount: 85000, time: new Date(now - 57600000).toISOString() },
    ],
  },
  {
    id: "a8", slug: "blantons-1984-first-release",
    name: "Blanton's 1984 Bottling First Release",
    subtitle: "ULTRA-RARE BOURBON",
    verifiedBy: "BAXUS", category: "SPIRITS", current_bid: 11200, start_price: 8000,
    end_time: new Date(now + 5 * day).toISOString(),
    image: "/blantons-1984.webp",
    description: "Blanton's 1984 Bottling First Release — one of the rarest bourbons in existence. First single barrel bourbon ever marketed. BAXUS authenticated and tokenized on Solana. NFT: AzvtfyKNpYcgavoYND9dGUBonbJR5DZeCEyX7UG7qvm2",
    bids: [
      { bidder: "Sin✨...c502", amount: 11200, time: new Date(now - 3600000).toISOString() },
      { bidder: "7xK9...mP2q", amount: 10500, time: new Date(now - 14400000).toISOString() },
      { bidder: "4fG2...nR8w", amount: 9800, time: new Date(now - 43200000).toISOString() },
    ],
  },
  {
    id: "a4", slug: "picasso-lithograph",
    name: "Pablo Picasso Original Lithograph",
    subtitle: "FINE ART MASTERS",
    verifiedBy: "Metaplex", category: "DIGITAL_ART", current_bid: 385, start_price: 250,
    end_time: new Date(now + 7 * day).toISOString(),
    image: "https://images.unsplash.com/photo-1579783902614-a3fb3927b6a5?w=800",
    description: "Original lithograph by Pablo Picasso, 'Le Repos' (1952). Signed and numbered 23/50. Provenance: Christie's New York. Museum-quality framing.",
    bids: [
      { bidder: "3nR5...vL8w", amount: 385, time: new Date(now - 900000).toISOString() },
      { bidder: "9pT2...hJ4x", amount: 350, time: new Date(now - 36000000).toISOString() },
      { bidder: "5mQ8...bN1y", amount: 310, time: new Date(now - 72000000).toISOString() },
      { bidder: "2kL7...qR9z", amount: 280, time: new Date(now - 86400000).toISOString() },
      { bidder: "8wN3...tF6a", amount: 260, time: new Date(now - 172800000).toISOString() },
    ],
  },
  // TCG and Sports Card auctions removed — real CC listings now
  {
    id: "a7", slug: "rolex-submariner-gold",
    name: "Rolex Submariner Date Gold",
    subtitle: "LUXURY WATCHES",
    verifiedBy: "Chrono24", category: "WATCHES", current_bid: 45000, start_price: 32000,
    end_time: new Date(now + 8 * day).toISOString(),
    image: "https://images.unsplash.com/photo-1523170335258-f5ed11844a49?w=800",
    description: "Rolex Submariner Date 16613 in 18K yellow gold. 1995 vintage. Excellent condition with original dial and hands. Complete with box and papers.",
    bids: [
      { bidder: "6pK1...jM9a", amount: 45000, time: new Date(now - 900000).toISOString() },
      { bidder: "8wN3...tF6a", amount: 38000, time: new Date(now - 43200000).toISOString() },
    ],
  },
];

const nativeListings: Listing[] = [
  // TCG Cards — removed, real CC listings now
  // Sports Cards — removed, real CC listings now
  // Spirits — removed, real BAXUS bottles now
  // Watches
  { id: "l10", name: "Rolex Submariner Date 126610LN", subtitle: "Steel • 41mm • 2024", price: 14500, image: "https://images.unsplash.com/photo-1523170335258-f5ed11844a49?w=400", verifiedBy: "Chrono24", category: "WATCHES", source: "native" },
  { id: "l11", name: "Patek Philippe Nautilus 5711/1A", subtitle: "Steel • Blue Dial • 2021", price: 145000, image: "https://images.unsplash.com/photo-1594534475808-b18fc33b045e?w=400", verifiedBy: "Chrono24", category: "WATCHES", source: "native" },
  { id: "l12", name: "Audemars Piguet Royal Oak 15500ST", subtitle: "Steel • 41mm • Blue Dial", price: 52000, image: "https://images.unsplash.com/photo-1614164185128-e4ec99c436d7?w=400", verifiedBy: "Chrono24", category: "WATCHES", source: "native" },
  { id: "l13", name: "Omega Speedmaster Professional", subtitle: "Moonwatch • Hesalite • 2023", price: 6500, image: "https://images.unsplash.com/photo-1547996160-81dfa63595aa?w=400", verifiedBy: "Chrono24", category: "WATCHES", source: "native" },
  // Digital Art
  { id: "l17", name: "Celestial Drift #42", subtitle: "Generative Art • 1/1", price: 12, image: "https://images.unsplash.com/photo-1634017839464-5c339ebe3cb4?w=400", verifiedBy: "Metaplex", category: "DIGITAL_ART", source: "native" },
  { id: "l18", name: "Neon Dreamscape", subtitle: "Photography • Limited Edition", price: 5, image: "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=400", verifiedBy: "Metaplex", category: "DIGITAL_ART", source: "native" },
  { id: "l19", name: "Abstract Genesis #7", subtitle: "Mixed Media • 1/1", price: 25, image: "https://images.unsplash.com/photo-1549490349-8643362247b5?w=400", verifiedBy: "Metaplex", category: "DIGITAL_ART", source: "native" },
];

// Create listings from BAXUS bottles (top 50 by price for homepage display)
const baxusListings: Listing[] = baxusBottles
  .filter(bottle => bottle.market_price > 0 && bottle.image_url)
  .slice(0, 200) // Get top 200 for category pages, will filter later for homepage
  .map((bottle, index) => ({
    id: `baxus-${bottle.bottle_release_id}`,
    name: `${bottle.brand} ${bottle.name}`,
    subtitle: `${bottle.spirit_type} • ${bottle.age ? `${bottle.age}yr` : 'NAS'} • ${bottle.country}`,
    price: Math.round(bottle.market_price),
    image: bottle.image_url,
    category: 'SPIRITS' as Category,
    verifiedBy: 'BAXUS',
    source: 'baxus' as const,
    externalUrl: bottle.baxusUrl,
    abv: bottle.abv,
    age: bottle.age,
    country: bottle.country,
    region: bottle.region,
    volume_ml: bottle.volume_ml,
    spirit_type: bottle.spirit_type,
  }));

// Create listings from Collector Crypt data
const ccCategoryMap: Record<string, Category> = {
  'TCG Cards': 'TCG_CARDS',
  'Sports Cards': 'SPORTS_CARDS',
};

const ccTransformedListings: Listing[] = ccListings
  .filter((item: any) => item.image && item.price > 0)
  .map((item: any) => ({
    id: `cc-${item.ccId}`,
    name: item.name,
    subtitle: `${item.ccCategory} • ${item.gradingCompany} ${item.gradeNum} • ${item.vault === 'PWCC' ? 'PWCC Vault' : item.vault || 'Vault'}`,
    price: item.price,
    image: item.image,
    category: ccCategoryMap[item.category] || ('TCG_CARDS' as Category),
    verifiedBy: item.gradingCompany || 'Collector Crypt',
    source: 'collector-crypt' as const,
    currency: item.currency,
    ccPrice: item.ccPrice,
    nftAddress: item.nftAddress,
    grade: item.grade,
    gradeNum: item.gradeNum,
    gradingCompany: item.gradingCompany,
    vault: item.vault,
    set: item.set,
    year: item.year,
    ccCategory: item.ccCategory,
    ccUrl: item.ccUrl,
  }));

// Combine native, BAXUS, and Collector Crypt listings
export const listings: Listing[] = [
  ...nativeListings,
  ...baxusListings,
  ...ccTransformedListings,
];

export const categoryColors: Record<Category, string> = {
  REAL_ESTATE: "text-blue-400",
  DIGITAL_ART: "text-purple-400",
  AGRICULTURE: "text-green-400",
  AVIATION: "text-cyan-400",
  PRECIOUS_METALS: "text-yellow-400",
  LUXURY: "text-gold-400",
  SPIRITS: "text-amber-400",
  TCG_CARDS: "text-red-400",
  SPORTS_CARDS: "text-orange-400",
  WATCHES: "text-gold-400",
  SEALED: "text-emerald-400",
  MERCHANDISE: "text-pink-400",
  PHYGITALS: "text-violet-400",
};

export const categoryLabels: Record<Category, string> = {
  REAL_ESTATE: "REAL ESTATE",
  DIGITAL_ART: "DIGITAL ART",
  AGRICULTURE: "AGRICULTURE",
  AVIATION: "AVIATION",
  PRECIOUS_METALS: "PRECIOUS METALS",
  LUXURY: "LUXURY",
  SPIRITS: "SPIRITS",
  TCG_CARDS: "TCG CARDS",
  SPORTS_CARDS: "SPORTS CARDS",
  WATCHES: "WATCHES",
  SEALED: "SEALED PRODUCT",
  MERCHANDISE: "MERCHANDISE",
  PHYGITALS: "PHYGITALS",
};

export const categorySlugMap: Record<string, Category> = {
  "digital-art": "DIGITAL_ART",
  "spirits": "SPIRITS",
  "tcg-cards": "TCG_CARDS",
  "sports-cards": "SPORTS_CARDS",
  "watches": "WATCHES",
  "sealed": "SEALED",
  "merchandise": "MERCHANDISE",
  "phygitals": "PHYGITALS",
};

export function formatPrice(n: number): string {
  if (n >= 1000000) return `$${(n / 1000000).toFixed(1)}M`;
  if (n >= 1000) return `$${(n / 1000).toFixed(1)}K`;
  return `$${n.toLocaleString()}`;
}

export function formatFullPrice(n: number): string {
  return `$${n.toLocaleString()}`;
}
