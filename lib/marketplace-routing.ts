type ExternalMarketplaceListingInput = {
  id?: string | null;
  source?: string | null;
  marketplace?: string | null;
  buyKind?: string | null;
  currency?: string | null;
};

export function isTensorMarketplaceListing(
  listing: ExternalMarketplaceListingInput | null | undefined,
): boolean {
  if (!listing) return false;

  if (listing.source === 'phygitals') return true;
  if (listing.buyKind === 'tensorCompressed' || listing.buyKind === 'tensorStandard') return true;
  if (typeof listing.id === 'string' && listing.id.startsWith('phyg-')) return true;
  if (listing.source === 'collector-crypt' && listing.currency?.trim().toUpperCase() === 'USDC') {
    return true;
  }

  return typeof listing.marketplace === 'string' && listing.marketplace.trim().toLowerCase() === 'tensor';
}