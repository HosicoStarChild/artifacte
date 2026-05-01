import assert from "node:assert";

import { applyArtifacteMarketplaceState } from "../app/auctions/cards/[id]/_lib/artifacte-marketplace-state.ts";
import {
  getCardBackHref,
  getCardBackLabel,
  type AuctionListing,
  type CardDetail,
} from "../app/auctions/cards/[id]/_lib/card-detail.ts";

function createAuctionListing(overrides: Partial<AuctionListing> = {}): AuctionListing {
  return {
    currency: "USDC",
    currentBid: 0,
    endTime: 0,
    highestBidder: null,
    listingType: "fixedPrice",
    price: 25,
    program: "core",
    seller: "seller-wallet",
    startTime: 0,
    status: "active",
    ...overrides,
  };
}

function createArtifacteCard(overrides: Partial<CardDetail> = {}): CardDetail {
  return {
    auctionListing: null,
    category: "TCG_CARDS",
    collection: "Artifacte",
    currency: "SOL",
    id: "Asset111111111111111111111111111111111111111",
    image: "/placeholder-card.svg",
    name: "Artifacte Test Card",
    nftAddress: "Asset111111111111111111111111111111111111111",
    price: 0,
    seller: "oracle-seller",
    source: "artifacte",
    solPrice: 0,
    subtitle: "Artifacte card",
    usdcPrice: null,
    ...overrides,
  };
}

describe("applyArtifacteMarketplaceState", () => {
  it("hydrates stale oracle Artifacte cards from a live on-chain listing", () => {
    const card = applyArtifacteMarketplaceState(createArtifacteCard(), {
      auctionListing: createAuctionListing({ price: 0.2, seller: "live-seller" }),
      tensorPrice: null,
    });

    assert.equal(card.currency, "USDC");
    assert.equal(card.price, 0.2);
    assert.equal(card.seller, "live-seller");
    assert.equal(card.auctionListing?.price, 0.2);
  });

  it("clears stale Artifacte listing prices when no live marketplace state exists", () => {
    const card = applyArtifacteMarketplaceState(
      createArtifacteCard({
        currency: "USDC",
        price: 12,
        seller: "oracle-seller",
        usdcPrice: 12,
      }),
      {
        auctionListing: null,
        tensorPrice: null,
      },
    );

    assert.equal(card.price, 0);
    assert.equal(card.auctionListing, null);
    assert.equal(card.usdcPrice, null);
    assert.equal(card.solPrice, 0);
  });
});

describe("Artifacte card detail back link", () => {
  it("routes Artifacte cards back to the Artifacte category page", () => {
    assert.equal(getCardBackHref("TCG_CARDS", "artifacte"), "/auctions/categories/artifacte");
    assert.equal(getCardBackLabel("TCG_CARDS", "artifacte"), "Artifacte");
  });

  it("keeps non-Artifacte TCG cards on the generic TCG category page", () => {
    assert.equal(getCardBackHref("TCG_CARDS", "collector-crypt"), "/auctions/categories/tcg-cards");
    assert.equal(getCardBackLabel("TCG_CARDS", "collector-crypt"), "TCG Cards");
  });
});