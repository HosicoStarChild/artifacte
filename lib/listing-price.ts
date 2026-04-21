export type ListingPriceInput = {
  price: number;
  currency?: string | null;
  source?: string | null;
  solPrice?: number | null;
  usdcPrice?: number | null;
  auctionListing?: { currency?: string | null } | null;
};

export type ListingPrimaryCurrency = 'SOL' | 'USDC' | 'USD1';

export function getListingPurchaseCurrency(listing: ListingPriceInput): ListingPrimaryCurrency {
  const displayCurrency = typeof listing.currency === 'string' && listing.currency
    ? listing.currency.toUpperCase()
    : 'USD1';
  const solPrice = Number(listing.solPrice);
  const usdcPrice = Number(listing.usdcPrice);
  const hasSolPrice = Number.isFinite(solPrice) && solPrice > 0;
  const hasUsdcPrice = Number.isFinite(usdcPrice) && usdcPrice > 0;

  if (displayCurrency === 'SOL') return 'SOL';
  if (displayCurrency === 'USDC') return 'USDC';
  if (hasUsdcPrice || displayCurrency === 'USDC') return 'USDC';
  if (displayCurrency === 'SOL' || hasSolPrice) return 'SOL';
  return 'USD1';
}

export function resolveListingDisplayPrice(listing: ListingPriceInput): {
  amount: number;
  currency: ListingPrimaryCurrency | string;
  secondaryAmount?: number;
  secondaryCurrency?: 'SOL';
} {
  const rawPrice = Number(listing.price);
  const amount = Number.isFinite(rawPrice) ? rawPrice : 0;
  const displayCurrency = typeof listing.currency === 'string' && listing.currency
    ? listing.currency.toUpperCase()
    : 'USD1';
  const solPrice = Number(listing.solPrice);
  const usdcPrice = Number(listing.usdcPrice);
  const hasSolPrice = Number.isFinite(solPrice) && solPrice > 0;
  const hasUsdcPrice = Number.isFinite(usdcPrice) && usdcPrice > 0;
  const primaryCurrency = getListingPurchaseCurrency(listing);

  if (primaryCurrency === 'USDC') {
    return {
      amount: hasUsdcPrice ? usdcPrice : amount,
      currency: 'USDC',
      secondaryAmount: hasSolPrice ? solPrice : undefined,
      secondaryCurrency: hasSolPrice ? 'SOL' : undefined,
    };
  }

  if (primaryCurrency === 'SOL') {
    return {
      amount: hasSolPrice ? solPrice : amount,
      currency: 'SOL',
    };
  }

  return {
    amount,
    currency: displayCurrency,
  };
}