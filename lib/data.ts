// On-chain program constants
export const AUCTION_PROGRAM_ID = "23fKEH3emeaJf1PW4Kts3exRnMjoNiqmqyFoNXH6qNiN";
export const RWA_NFT_PROGRAM_ID = "F9mkXqMrgF1sSV3wDtTUpTs82B5XJ5qz9A33nBAdcNqb";
export const TREASURY_WALLET = "DDSpvAK8DbuAdEaaBHkfLieLPSJVCWWgquFAA3pvxXoX";
export const USD1_MINT = "USD1ttGY1N17NEEHLmELoaybftRBUSErhqYiQzvEmuB";
export const USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";

export type Category = 
  | "REAL_ESTATE" | "DIGITAL_ART" | "AGRICULTURE" 
  | "AVIATION" | "PRECIOUS_METALS" | "LUXURY" | "SPIRITS"
  | "TCG_CARDS" | "SPORTS_CARDS" | "WATCHES";

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
  category?: Category;
  nftMint?: string;
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
    id: "a8", slug: "blantons-1984-first-release",
    name: "Blanton's 1984 Bottling First Release",
    subtitle: "ULTRA-RARE BOURBON",
    category: "SPIRITS", current_bid: 11200, start_price: 8000,
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
    category: "DIGITAL_ART", current_bid: 385, start_price: 250,
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
  {
    id: "a5", slug: "charizard-holographic",
    name: "Charizard Holographic Base Set",
    subtitle: "POKEMON TCG RARE",
    category: "TCG_CARDS", current_bid: 12500, start_price: 8000,
    end_time: new Date(now + 4 * day).toISOString(),
    image: "https://images.unsplash.com/photo-1516975080664-ed2fc6a32937?w=800",
    description: "1999 Pokémon Base Set Charizard Holographic (4/102). Graded PSA 8. Pristine condition with sharp corners and excellent centering.",
    bids: [
      { bidder: "5kL2...dF9w", amount: 12500, time: new Date(now - 7200000).toISOString() },
      { bidder: "2tR4...bN6x", amount: 11000, time: new Date(now - 14400000).toISOString() },
    ],
  },
  {
    id: "a6", slug: "michael-jordan-rookie",
    name: "Michael Jordan Rookie Card",
    subtitle: "SPORTS CARDS LEGEND",
    category: "SPORTS_CARDS", current_bid: 85000, start_price: 55000,
    end_time: new Date(now + 6 * day).toISOString(),
    image: "https://images.unsplash.com/photo-1518611505868-48aeb845e7c6?w=800",
    description: "1986-87 Fleer Michael Jordan Rookie Card #57. Graded PSA 9. Iconic card in excellent condition.",
    bids: [
      { bidder: "9hJ3...cQ8z", amount: 85000, time: new Date(now - 3600000).toISOString() },
      { bidder: "4mW7...xT5n", amount: 72000, time: new Date(now - 18000000).toISOString() },
    ],
  },
  {
    id: "a7", slug: "rolex-submariner-gold",
    name: "Rolex Submariner Date Gold",
    subtitle: "LUXURY WATCHES",
    category: "WATCHES", current_bid: 45000, start_price: 32000,
    end_time: new Date(now + 8 * day).toISOString(),
    image: "https://images.unsplash.com/photo-1523170335258-f5ed11844a49?w=800",
    description: "Rolex Submariner Date 16613 in 18K yellow gold. 1995 vintage. Excellent condition with original dial and hands. Complete with box and papers.",
    bids: [
      { bidder: "6pK1...jM9a", amount: 45000, time: new Date(now - 900000).toISOString() },
      { bidder: "8wN3...tF6a", amount: 38000, time: new Date(now - 43200000).toISOString() },
    ],
  },
];

export const listings: Listing[] = [
  { id: "l1", name: "Zambian Emerald 4ct", subtitle: "Certified Precious Gemstone", price: 28000, image: "https://images.unsplash.com/photo-1583937443566-6b064bd677e9?w=400", category: "PRECIOUS_METALS" },
  { id: "l2", name: "SkyLink Jet Fleet", subtitle: "Yield-bearing aviation RWA", price: 5000000, image: "https://images.unsplash.com/photo-1474302770737-173ee21bab63?w=400", category: "AVIATION" },
  { id: "l3", name: "Tuscany Vineyard Estate", subtitle: "Agricultural Asset NFT", price: 1500000, image: "https://images.unsplash.com/photo-1560493676-04071c5f467b?w=400", category: "AGRICULTURE" },
  { id: "l4", name: "Platinum Bar Collection", subtitle: "Physical Precious Metal Holdings", price: 450000, image: "https://images.unsplash.com/photo-1589656966895-2f33e7653819?w=400", category: "PRECIOUS_METALS" },
  { id: "l5", name: "Miami Oceanfront Penthouse", subtitle: "Luxury Real Estate NFT", price: 2000000, image: "https://images.unsplash.com/photo-1512917774080-9991f1c4c750?w=400", category: "REAL_ESTATE" },
  { id: "l6", name: "Eternal Light Sculpture", subtitle: "Premium Digital Art NFT", price: 250, image: "https://images.unsplash.com/photo-1561214115-f2f134cc4912?w=400", category: "DIGITAL_ART" },
  { id: "l7", name: "Blastoise Holographic Card", subtitle: "Pokemon TCG Vintage", price: 8500, image: "https://images.unsplash.com/photo-1516975080664-ed2fc6a32937?w=400", category: "TCG_CARDS" },
  { id: "l8", name: "Babe Ruth Signed Baseball Card", subtitle: "Vintage Sports Memorabilia", price: 45000, image: "https://images.unsplash.com/photo-1518611505868-48aeb845e7c6?w=400", category: "SPORTS_CARDS" },
  { id: "l9", name: "Omega Speedmaster Professional", subtitle: "Chronograph Luxury Watch", price: 6500, image: "https://images.unsplash.com/photo-1523170335258-f5ed11844a49?w=400", category: "WATCHES" },
  { id: "l10", name: "Macallan 25 Year Single Malt", subtitle: "Rare Single Cask Whisky", price: 18000, image: "https://images.unsplash.com/photo-1569529465841-dfecdab7503b?w=400", category: "SPIRITS" },
  { id: "l11", name: "Blanton's 1984 Bottling First Release", subtitle: "Ultra-Rare Bourbon • BAXUS Verified", price: 12500, image: "/blantons-1984.webp", category: "SPIRITS", nftMint: "AzvtfyKNpYcgavoYND9dGUBonbJR5DZeCEyX7UG7qvm2" },
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
};

export const categorySlugMap: Record<string, Category> = {
  "digital-art": "DIGITAL_ART",
  "spirits": "SPIRITS",
  "tcg-cards": "TCG_CARDS",
  "sports-cards": "SPORTS_CARDS",
  "watches": "WATCHES",
};

export function formatPrice(n: number): string {
  if (n >= 1000000) return `$${(n / 1000000).toFixed(1)}M`;
  if (n >= 1000) return `$${(n / 1000).toFixed(1)}K`;
  return `$${n.toLocaleString()}`;
}

export function formatFullPrice(n: number): string {
  return `$${n.toLocaleString()}`;
}
