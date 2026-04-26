import assert from "node:assert";

import {
  filterOwnedArtifacteSection,
  getActiveMyListingMintSet,
} from "../app/my-listings/_lib/owned-artifacte.ts";
import type { PortfolioAssetCard, PortfolioSection } from "../lib/portfolio.ts";
import type { MyListingRecord, MyListingStatus } from "../lib/my-listings.ts";

function createAssetCard(id: string): PortfolioAssetCard {
  return {
    aspectRatio: "square",
    badgeAccent: "gold",
    badgeLabel: "Artifacte Verified",
    href: `/auctions/cards/${id}`,
    id,
    imageFit: "cover",
    imageSrc: "https://example.com/card.png",
    marketValue: 55,
    marketValueCurrency: "USD",
    name: `Card ${id}`,
    sectionId: "artifacte-rwa",
  };
}

function createSection(ids: string[]): PortfolioSection {
  return {
    accent: "gold",
    description: "Artifacte-minted RWAs priced from oracle and marketplace data.",
    id: "artifacte-rwa",
    items: ids.map(createAssetCard),
    title: "Artifacte RWA",
  };
}

function createListing(
  nftMint: string,
  status: MyListingStatus = "active",
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
    source: "artifacte",
    status,
  };
}

describe("filterOwnedArtifacteSection", () => {
  it("keeps only owned assets that are still actively listed", () => {
    const activeListingMints = getActiveMyListingMintSet([
      createListing("mint-active", "active"),
      createListing("mint-cancelled", "cancelled"),
      createListing("mint-completed", "completed"),
    ]);

    const filteredSection = filterOwnedArtifacteSection(
      createSection(["mint-active", "mint-cancelled", "mint-unlisted"]),
      activeListingMints,
    );

    assert.ok(filteredSection);
    assert.deepEqual(filteredSection?.items.map((item) => item.id), ["mint-active"]);
    assert.equal(filteredSection?.title, "Owned Listed Artifacte NFTs");
    assert.equal(
      filteredSection?.description,
      "Artifacte NFTs this wallet still holds and currently has listed for sale.",
    );
  });

  it("returns null when the wallet does not own any actively listed Artifacte NFTs", () => {
    const filteredSection = filterOwnedArtifacteSection(
      createSection(["mint-unlisted", "mint-cancelled"]),
      getActiveMyListingMintSet([
        createListing("mint-cancelled", "cancelled"),
        createListing("mint-completed", "completed"),
      ]),
    );

    assert.equal(filteredSection, null);
  });
});