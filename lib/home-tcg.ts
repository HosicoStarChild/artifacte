export type HomeTCGListing = {
  id: string;
  name: string;
  subtitle: string;
  price: number;
  image: string;
  currency: string;
  verifiedBy: string;
  ccCategory: string;
  collection?: string | null;
  collectionAddress?: string | null;
  source?: string;
  marketplace?: string;
  buyKind?: string;
  solPrice?: number | null;
  usdcPrice?: number | null;
  nftAddress?: string;
};

type HomeTCGListingsResponse = {
  listings?: HomeTCGListing[];
};

export async function fetchHomeTCGListings(url: string): Promise<HomeTCGListing[]> {
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error("Failed to fetch listings");
  }

  const data: HomeTCGListingsResponse = await response.json();
  return data.listings ?? [];
}

export function getHomeTCGCardHref(listing: HomeTCGListing): string {
  if (listing.source === "artifacte" && listing.nftAddress) {
    return `/auctions/cards/${listing.nftAddress}`;
  }

  return `/auctions/cards/${listing.id}`;
}

export function isInAppExternalCardListing(listing: HomeTCGListing): boolean {
  return listing.source === "collector-crypt" || listing.source === "phygitals";
}

export function formatHomeListingQuote(amount: number, currency: string): string {
  const formattedAmount = amount.toLocaleString(
    undefined,
    currency === "SOL" ? { maximumFractionDigits: 4 } : undefined
  );

  return currency === "SOL"
    ? `◎ ${formattedAmount} SOL`
    : `$${formattedAmount} ${currency}`;
}