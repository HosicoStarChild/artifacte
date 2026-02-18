export type Category = 
  | "REAL_ESTATE" | "DIGITAL_ART" | "AGRICULTURE" 
  | "AVIATION" | "PRECIOUS_METALS" | "LUXURY" | "SPIRITS";

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
}

const now = Date.now();
const day = 86400000;

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
    category: "SPIRITS", current_bid: 98500, start_price: 65000,
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
    id: "a4", slug: "picasso-lithograph",
    name: "Pablo Picasso Original Lithograph",
    subtitle: "FINE ART MASTERS",
    category: "DIGITAL_ART", current_bid: 385000, start_price: 250000,
    end_time: new Date(now + 7 * day).toISOString(),
    image: "https://images.unsplash.com/photo-1579783902614-a3fb3927b6a5?w=800",
    description: "Original lithograph by Pablo Picasso, 'Le Repos' (1952). Signed and numbered 23/50. Provenance: Christie's New York. Museum-quality framing.",
    bids: [
      { bidder: "3nR5...vL8w", amount: 385000, time: new Date(now - 900000).toISOString() },
      { bidder: "9pT2...hJ4x", amount: 350000, time: new Date(now - 36000000).toISOString() },
      { bidder: "5mQ8...bN1y", amount: 310000, time: new Date(now - 72000000).toISOString() },
      { bidder: "2kL7...qR9z", amount: 280000, time: new Date(now - 86400000).toISOString() },
      { bidder: "8wN3...tF6a", amount: 260000, time: new Date(now - 172800000).toISOString() },
    ],
  },
];

export const listings: Listing[] = [
  { id: "l1", name: "Zambian Emerald 4ct", subtitle: "Certified Precious Gemstone", price: 28000, image: "https://images.unsplash.com/photo-1583937443566-6b064bd677e9?w=400" },
  { id: "l2", name: "SkyLink Jet Fleet", subtitle: "Yield-bearing aviation RWA", price: 5000000, image: "https://images.unsplash.com/photo-1474302770737-173ee21bab63?w=400" },
  { id: "l3", name: "Tuscany Vineyard Estate", subtitle: "Agricultural Asset NFT", price: 1500000, image: "https://images.unsplash.com/photo-1560493676-04071c5f467b?w=400" },
  { id: "l4", name: "Platinum Bar Collection", subtitle: "Physical Precious Metal Holdings", price: 450000, image: "https://images.unsplash.com/photo-1589656966895-2f33e7653819?w=400" },
  { id: "l5", name: "Miami Oceanfront Penthouse", subtitle: "Luxury Real Estate NFT", price: 2000000, image: "https://images.unsplash.com/photo-1512917774080-9991f1c4c750?w=400" },
  { id: "l6", name: "Eternal Light Sculpture", subtitle: "Premium Digital Art NFT", price: 32500, image: "https://images.unsplash.com/photo-1561214115-f2f134cc4912?w=400" },
];

export const categoryColors: Record<Category, string> = {
  REAL_ESTATE: "text-blue-400",
  DIGITAL_ART: "text-purple-400",
  AGRICULTURE: "text-green-400",
  AVIATION: "text-cyan-400",
  PRECIOUS_METALS: "text-yellow-400",
  LUXURY: "text-gold-400",
  SPIRITS: "text-amber-400",
};

export const categoryLabels: Record<Category, string> = {
  REAL_ESTATE: "REAL ESTATE",
  DIGITAL_ART: "DIGITAL ART",
  AGRICULTURE: "AGRICULTURE",
  AVIATION: "AVIATION",
  PRECIOUS_METALS: "PRECIOUS METALS",
  LUXURY: "LUXURY",
  SPIRITS: "SPIRITS",
};

export function formatPrice(n: number): string {
  if (n >= 1000000) return `$${(n / 1000000).toFixed(1)}M`;
  if (n >= 1000) return `$${(n / 1000).toFixed(1)}K`;
  return `$${n.toLocaleString()}`;
}

export function formatFullPrice(n: number): string {
  return `$${n.toLocaleString()}`;
}
