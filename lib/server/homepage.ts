import { cacheLife, cacheTag } from "next/cache";

import { getOracleApiUrl } from "@/lib/server/oracle-env";

const ORACLE_API = getOracleApiUrl();

export type HomeListing = {
  id?: string;
  name?: string;
  subtitle?: string;
  image?: string;
  price?: number;
  category?: string;
  source?: string;
  marketplace?: string;
  verifiedBy?: string;
  externalUrl?: string;
  nftAddress?: string;
  currency?: string;
  solPrice?: number | null;
  spiritType?: string;
};

export type HomeCategoryLink = {
  name: string;
  slug: string;
  href: string;
  image: string;
  count: string;
  contain?: boolean;
};

export type HomeProcessStep = {
  step: string;
  title: string;
  description: string;
};

type HomeListingsResponse = {
  listings?: HomeListing[];
};

export const homeCategoryCards: readonly HomeCategoryLink[] = [
  {
    name: "Digital Collectibles",
    slug: "digital-art",
    href: "/digital-art",
    image: "/images/digital-collectibles-collage.jpg",
    count: "",
  },
  {
    name: "Spirits",
    slug: "spirits",
    href: "/auctions/categories/spirits",
    image: "https://images.unsplash.com/photo-1569529465841-dfecdab7503b?w=600&q=80",
    count: "2,300+",
  },
  {
    name: "Sports Cards",
    slug: "sports-cards",
    href: "/auctions/categories/sports-cards",
    image: "https://images.unsplash.com/photo-1566577739112-5180d4bf9390?w=600&q=80",
    count: "110+",
  },
  {
    name: "TCG Cards",
    slug: "tcg-cards",
    href: "/auctions/categories/tcg-cards",
    image: "https://images.unsplash.com/photo-1613771404784-3a5686aa2be3?w=600&q=80",
    count: "16,900+",
  },
  {
    name: "Sealed Product",
    slug: "sealed",
    href: "/auctions/categories/sealed",
    image: "/images/sealed-packs.jpg",
    count: "130+",
  },
  {
    name: "Merchandise",
    slug: "merchandise",
    href: "/auctions/categories/merchandise",
    image: "/images/merchandise-hero.jpg",
    count: "500+",
  },
] as const;

export const homeProcessSteps: readonly HomeProcessStep[] = [
  {
    step: "01",
    title: "Browse & Discover",
    description:
      "Explore curated real-world assets tokenized as NFTs with verified provenance and authentication.",
  },
  {
    step: "02",
    title: "Bid or Buy",
    description:
      "Place bids on live auctions or purchase items at fixed prices using USD1 or USDC on Solana.",
  },
  {
    step: "03",
    title: "Own & Trade",
    description:
      "Take ownership of your asset NFT and trade it on secondary markets with full transparency.",
  },
] as const;

function matchesNormalizedValue(value: string | undefined, target: string): boolean {
  return typeof value === "string" && value.trim().toLowerCase() === target;
}

export function isBaxusListing(listing: HomeListing): boolean {
  return (
    matchesNormalizedValue(listing.source, "baxus") ||
    matchesNormalizedValue(listing.marketplace, "baxus") ||
    matchesNormalizedValue(listing.verifiedBy, "baxus")
  );
}

function hasDisplayableListingData(listing: HomeListing): boolean {
  return Boolean(listing.image) && typeof listing.price === "number" && listing.price > 0;
}

export function hasVisibleListingData(listing: HomeListing): boolean {
  return !isBaxusListing(listing) && hasDisplayableListingData(listing);
}

export function getVisibleHomeCategoryCards(showSpirits: boolean): HomeCategoryLink[] {
  if (showSpirits) {
    return [...homeCategoryCards];
  }

  return homeCategoryCards.filter((card) => card.slug !== "spirits");
}

export function getHomeHeroCta(listing: HomeListing): {
  href: string;
  label: string;
  external: boolean;
} {
  if (listing.externalUrl) {
    return {
      href: listing.externalUrl,
      label: "View Listing →",
      external: true,
    };
  }

  if (listing.id || listing.nftAddress) {
    return {
      href: `/auctions/cards/${listing.id ?? listing.nftAddress}`,
      label: "View Details →",
      external: false,
    };
  }

  const categorySlug = listing.category?.toLowerCase().replaceAll("_", "-");

  return {
    href: categorySlug ? `/auctions/categories/${categorySlug}` : "/auctions",
    label: "Browse Collection →",
    external: false,
  };
}

async function fetchHomeListings(query: string): Promise<HomeListing[]> {
  const response = await fetch(`${ORACLE_API}/api/listings?${query}`);

  if (!response.ok) {
    return [];
  }

  const data: HomeListingsResponse = await response.json();
  return data.listings ?? [];
}

export async function getSpiritsCarousel(): Promise<HomeListing[]> {
  "use cache";

  cacheLife("hours");
  cacheTag("home-listings");

  try {
    const listings = await fetchHomeListings("category=SPIRITS&perPage=12&sort=price-desc");
    return listings.filter((listing) => hasDisplayableListingData(listing));
  } catch {
    return [];
  }
}

export async function getFeaturedListing(): Promise<HomeListing | null> {
  "use cache";

  cacheLife("hours");
  cacheTag("home-listings");

  try {
    const now = new Date();
    const start = new Date(now.getFullYear(), 0, 0);
    const dayOfYear = Math.floor((now.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));

    const listings = await fetchHomeListings("perPage=100&sort=price-desc");
    const premiumListings = listings.filter(
      (listing) => hasVisibleListingData(listing) && (listing.price ?? 0) >= 500
    );

    if (premiumListings.length === 0) {
      return null;
    }

    return premiumListings[dayOfYear % premiumListings.length] ?? null;
  } catch {
    return null;
  }
}