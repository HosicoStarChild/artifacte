import assert from "node:assert";

import {
  ARTIFACTE_LISTINGS_SECTION_DESCRIPTION,
  ARTIFACTE_LISTINGS_SECTION_TITLE,
  getActiveArtifacteListings,
} from "../app/my-listings/_lib/owned-artifacte.ts";
import { ARTIFACTE_COLLECTION_ID } from "../lib/external-purchase-fees.ts";
import type { MyListingRecord, MyListingSource, MyListingStatus } from "../lib/my-listings.ts";

interface CreateListingOptions {
  collectionAddress?: string;
  source?: MyListingSource;
  status?: MyListingStatus;
}

function createListing(
  nftMint: string,
  options: CreateListingOptions = {},
): MyListingRecord {
  return {
    ...(options.collectionAddress ? { collectionAddress: options.collectionAddress } : {}),
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
    source: options.source ?? "artifacte",
    status: options.status ?? "active",
  };
}

describe("getActiveArtifacteListings", () => {
  it("keeps active listings from the Artifacte collection for the wallet", () => {
    const listings = getActiveArtifacteListings([
      createListing("mint-native-active"),
      createListing("mint-cancelled", { status: "cancelled" }),
      createListing("mint-completed", { status: "completed" }),
      createListing("mint-core-artifacte", {
        collectionAddress: ARTIFACTE_COLLECTION_ID,
        source: "artifacte-core",
      }),
      createListing("mint-tensor-artifacte", {
        collectionAddress: ARTIFACTE_COLLECTION_ID,
        source: "tensor",
      }),
      createListing("mint-core-other", {
        collectionAddress: "other-collection",
        source: "artifacte-core",
      }),
    ]);

    assert.deepEqual(listings.map((listing) => listing.nftMint), [
      "mint-native-active",
      "mint-core-artifacte",
      "mint-tensor-artifacte",
    ]);
    assert.equal(ARTIFACTE_LISTINGS_SECTION_TITLE, "Artifacte NFTs");
    assert.equal(
      ARTIFACTE_LISTINGS_SECTION_DESCRIPTION,
      "Active listings from the Artifacte collection created by this wallet, including NFTs currently held in marketplace escrow.",
    );
  });

  it("returns an empty list when the wallet has no active Artifacte listings", () => {
    const listings = getActiveArtifacteListings([
      createListing("mint-cancelled", {
        collectionAddress: ARTIFACTE_COLLECTION_ID,
        status: "cancelled",
      }),
      createListing("mint-completed", { status: "completed" }),
      createListing("mint-core", {
        collectionAddress: "other-collection",
        source: "artifacte-core",
      }),
    ]);

    assert.deepEqual(listings, []);
  });
});