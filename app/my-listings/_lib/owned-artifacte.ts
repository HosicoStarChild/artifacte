import type { PortfolioSection as PortfolioSectionData } from "../../../lib/portfolio";
import type { MyListingRecord } from "../../../lib/my-listings";

const OWNED_LISTED_ARTIFACTE_TITLE = "Owned Listed Artifacte NFTs";
const OWNED_LISTED_ARTIFACTE_DESCRIPTION = "Artifacte NFTs this wallet still holds and currently has listed for sale.";

export function getActiveMyListingMintSet(
  listings: MyListingRecord[],
): Set<string> {
  return new Set(
    listings
      .filter((listing) => listing.status === "active")
      .map((listing) => listing.nftMint),
  );
}

export function filterOwnedArtifacteSection(
  section: PortfolioSectionData | null,
  activeListingMints: ReadonlySet<string>,
): PortfolioSectionData | null {
  if (!section || activeListingMints.size === 0) {
    return null;
  }

  const filteredItems = section.items.filter((item) => activeListingMints.has(item.id));
  if (filteredItems.length === 0) {
    return null;
  }

  return {
    ...section,
    description: OWNED_LISTED_ARTIFACTE_DESCRIPTION,
    items: filteredItems,
    title: OWNED_LISTED_ARTIFACTE_TITLE,
  };
}