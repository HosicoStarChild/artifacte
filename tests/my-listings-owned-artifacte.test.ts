import assert from "node:assert";

import {
  ARTIFACTE_LISTINGS_SECTION_DESCRIPTION,
  ARTIFACTE_LISTINGS_SECTION_TITLE,
  getActiveArtifacteListings,
} from "../app/my-listings/_lib/owned-artifacte.ts";
import type { MyListingRecord, MyListingSource, MyListingStatus } from "../lib/my-listings.ts";

function createListing(
  nftMint: string,
  status: MyListingStatus = "active",
  source: MyListingSource = "artifacte",
): MyListingRecord {
  return {
    currency: "USDC",
    href: `/auctions/cards/${nftMint}`,
    id: `listing-${nftMint}`,
    image: "https://example.com/card.png",
    isCore: false,
    isPnft: false,
    isToken2022: false,
    listingTypeLabel: "Fixed Price",
    mode: "fixed-price",
    name: `Listing ${nftMint}`,
    nftMint,
    price: 55,
    royaltyBasisPoints: 0,
    source,
    status,
  };
}

describe("getActiveArtifacteListings", () => {
  it("keeps only active Artifacte listings for the wallet", () => {
    const listings = getActiveArtifacteListings([
      createListing("mint-active", "active"),
      createListing("mint-cancelled", "cancelled"),
      createListing("mint-completed", "completed"),
      createListing("mint-core", "active", "artifacte-core"),
      createListing("mint-tensor", "active", "tensor"),
    ]);

    assert.deepEqual(listings.map((listing) => listing.nftMint), ["mint-active"]);
    assert.equal(ARTIFACTE_LISTINGS_SECTION_TITLE, "Artifacte NFTs");
    assert.equal(
      ARTIFACTE_LISTINGS_SECTION_DESCRIPTION,
      "Active Artifacte listings created by this wallet, including NFTs currently held in marketplace escrow.",
    );
  });

  it("returns an empty list when the wallet has no active Artifacte listings", () => {
    const listings = getActiveArtifacteListings([
      createListing("mint-cancelled", "cancelled"),
      createListing("mint-completed", "completed"),
      createListing("mint-core", "active", "artifacte-core"),
    ]);

    assert.deepEqual(listings, []);
  });
});