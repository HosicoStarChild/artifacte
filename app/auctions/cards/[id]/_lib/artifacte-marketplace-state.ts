type ArtifacteAuctionListingLike = {
  currency: string;
  price: number;
  seller: string;
};

type ArtifacteTensorPriceLike = {
  seller: string | null;
  solPrice: number | null;
  usdcPrice: number | null;
};

type ArtifacteCardLike = {
  auctionListing?: ArtifacteAuctionListingLike | null;
  currency: string;
  price: number;
  seller?: string;
  solPrice?: number | null;
  usdcPrice?: number | null;
};

export type ArtifacteMarketplaceState = {
  auctionListing: ArtifacteAuctionListingLike | null;
  tensorPrice: ArtifacteTensorPriceLike | null;
};

export function applyArtifacteMarketplaceState<TCard extends ArtifacteCardLike>(
  card: TCard,
  { auctionListing, tensorPrice }: ArtifacteMarketplaceState,
): TCard {
  const nextCurrency = auctionListing?.currency
    || (tensorPrice?.usdcPrice ? "USDC" : tensorPrice?.solPrice ? "SOL" : card.currency);

  return {
    ...card,
    auctionListing,
    currency: nextCurrency,
    price: auctionListing?.price || tensorPrice?.usdcPrice || tensorPrice?.solPrice || 0,
    seller: auctionListing?.seller || tensorPrice?.seller || card.seller || "",
    solPrice: tensorPrice?.solPrice || 0,
    usdcPrice: tensorPrice?.usdcPrice || null,
  };
}