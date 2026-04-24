import {
  calculateExternalMarketplaceFee,
  shouldApplyExternalMarketplaceFee,
  type ExternalFeeContext,
} from './external-purchase-fees';

export type ListingPriceInput = {
  price: number;
  currency?: string | null;
  currencySymbol?: string | null;
  source?: string | null;
  solPrice?: number | null;
  usdcPrice?: number | null;
  royaltyBasisPoints?: number | null;
  auctionListing?: { currency?: string | null } | null;
};

export type ListingPrimaryCurrency = 'SOL' | 'USDC' | 'USD1';

export type ListingPayablePrice = {
  amount: number;
  currency: ListingPrimaryCurrency | string;
  secondaryAmount?: number;
  secondaryCurrency?: 'SOL';
  baseAmount: number;
  platformFeeAmount: number;
  feeApplied: boolean;
};

export type ExternalMarketplacePayablePrice = {
  amount: number;
  currency: ListingPrimaryCurrency | string;
  secondaryAmount?: number;
  secondaryCurrency?: 'SOL';
  baseAmount: number;
  royaltyBasisPoints: number;
  royaltyAmount: number;
  platformFeeAmount: number;
  feeApplied: boolean;
};

function normalizeBasisPoints(value?: number | null): number {
  const numericValue = Number(value);

  if (!Number.isFinite(numericValue) || numericValue <= 0) {
    return 0;
  }

  return numericValue;
}

export function calculateRoyaltyAmount(
  amount: number,
  royaltyBasisPoints?: number | null,
): number {
  const numericAmount = Number(amount);
  if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
    return 0;
  }

  return numericAmount * normalizeBasisPoints(royaltyBasisPoints) / 10000;
}

export function getListingPurchaseCurrency(listing: ListingPriceInput): ListingPrimaryCurrency {
  const displayCurrency = typeof listing.currency === 'string' && listing.currency
    ? listing.currency.toUpperCase()
    : typeof listing.currencySymbol === 'string' && listing.currencySymbol
      ? listing.currencySymbol.toUpperCase()
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
    : typeof listing.currencySymbol === 'string' && listing.currencySymbol
      ? listing.currencySymbol.toUpperCase()
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

export function resolveListingPayablePrice(
  listing: ListingPriceInput,
  feeContext?: ExternalFeeContext | null,
): ListingPayablePrice {
  const displayPrice = resolveListingDisplayPrice(listing);
  const feeApplied = shouldApplyExternalMarketplaceFee({
    source: listing.source,
    ...feeContext,
  });
  const platformFeeAmount = feeApplied
    ? calculateExternalMarketplaceFee(displayPrice.amount)
    : 0;

  return {
    ...displayPrice,
    amount: displayPrice.amount + platformFeeAmount,
    baseAmount: displayPrice.amount,
    platformFeeAmount,
    feeApplied,
  };
}

export function resolveExternalMarketplacePayablePrice(
  listing: ListingPriceInput,
  feeContext?: ExternalFeeContext | null,
): ExternalMarketplacePayablePrice {
  const displayPrice = resolveListingDisplayPrice(listing);
  const royaltyBasisPoints = normalizeBasisPoints(listing.royaltyBasisPoints);
  const royaltyAmount = calculateRoyaltyAmount(
    displayPrice.amount,
    royaltyBasisPoints,
  );
  const feeApplied = shouldApplyExternalMarketplaceFee({
    source: listing.source,
    ...feeContext,
  });
  const platformFeeAmount = feeApplied
    ? calculateExternalMarketplaceFee(displayPrice.amount)
    : 0;

  return {
    ...displayPrice,
    amount: displayPrice.amount + royaltyAmount + platformFeeAmount,
    baseAmount: displayPrice.amount,
    royaltyBasisPoints,
    royaltyAmount,
    platformFeeAmount,
    feeApplied,
  };
}