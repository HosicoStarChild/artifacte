import type { MyListingRecord } from "../../../lib/my-listings";

export const ARTIFACTE_LISTINGS_SECTION_TITLE = "Artifacte NFTs";
export const ARTIFACTE_LISTINGS_SECTION_DESCRIPTION = "Active Artifacte listings created by this wallet, including NFTs currently held in marketplace escrow.";

export function getActiveArtifacteListings(
  listings: MyListingRecord[],
): MyListingRecord[] {
  return listings.filter(
    (listing) => listing.source === "artifacte" && listing.status === "active",
  );
}