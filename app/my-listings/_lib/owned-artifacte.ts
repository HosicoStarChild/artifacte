import type { MyListingRecord } from "../../../lib/my-listings";

const ARTIFACTE_COLLECTION_ID = "jzkJTGAuDcWthM91S1ch7wPcfMUQB5CdYH6hA25K4CS";

export const ARTIFACTE_LISTINGS_SECTION_TITLE = "Artifacte NFTs";
export const ARTIFACTE_LISTINGS_SECTION_DESCRIPTION = "Active listings from the Artifacte collection created by this wallet, including NFTs currently held in marketplace escrow.";

function isArtifacteCollectionListing(
  listing: Pick<MyListingRecord, "collectionAddress" | "source">,
): boolean {
  return (
    listing.source === "artifacte"
    || listing.collectionAddress === ARTIFACTE_COLLECTION_ID
  );
}

export function getActiveArtifacteListings(
  listings: MyListingRecord[],
): MyListingRecord[] {
  return listings.filter(
    (listing) => (
      listing.status === "active"
      && isArtifacteCollectionListing(listing)
    ),
  );
}