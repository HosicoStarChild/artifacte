import assert from "node:assert";

import { resolveCardDetailActionState } from "../app/auctions/cards/[id]/_lib/card-action-state.ts";
import type { AuctionListing, CardDetail } from "../app/auctions/cards/[id]/_lib/card-detail.ts";

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

function createCard(overrides: Partial<CardDetail> = {}): CardDetail {
  return {
    auctionListing: createAuctionListing({ seller: overrides.seller ?? "seller-wallet" }),
    category: "TCG_CARDS",
    currency: "USDC",
    id: "Mint111111111111111111111111111111111111111",
    image: "/placeholder-card.svg",
    name: "Artifacte Test Card",
    nftAddress: "Mint111111111111111111111111111111111111111",
    owner: "seller-wallet",
    price: 25,
    seller: "seller-wallet",
    source: "artifacte",
    subtitle: "Artifacte card",
    ...overrides,
  };
}

describe("resolveCardDetailActionState", () => {
  it("returns a buy state for a listed Artifacte card viewed by a connected non-owner", () => {
    const state = resolveCardDetailActionState({
      card: createCard(),
      connected: true,
      viewerPublicKey: "buyer-wallet",
    });

    assert.equal(state.action.type, "buy");
    if (state.action.type !== "buy") {
      throw new Error("Expected a buy action");
    }
    assert.equal(state.action.requiresConnection, false);
    assert.equal(state.showMarketplaceLabel, true);
    assert.equal(state.showNotListedMessage, false);
  });

  it("returns a disabled connect-wallet buy state for a listed Artifacte card when disconnected", () => {
    const state = resolveCardDetailActionState({
      card: createCard(),
      connected: false,
      viewerPublicKey: null,
    });

    assert.equal(state.action.type, "buy");
    if (state.action.type !== "buy") {
      throw new Error("Expected a buy action");
    }
    assert.equal(state.action.requiresConnection, true);
  });

  it("returns owner-listed actions for the seller wallet", () => {
    const state = resolveCardDetailActionState({
      card: createCard(),
      connected: true,
      viewerPublicKey: "seller-wallet",
    });

    assert.equal(state.action.type, "owner-listed");
    assert.equal(state.isOwner, true);
  });

  it("returns owner-listed actions for the asset owner when core listing seller differs", () => {
    const state = resolveCardDetailActionState({
      card: createCard({ owner: "asset-owner-wallet", seller: "artifacte-authority" }),
      connected: true,
      viewerPublicKey: "asset-owner-wallet",
    });

    assert.equal(state.action.type, "owner-listed");
    assert.equal(state.isOwner, true);
  });

  it("returns a not-listed state for unlisted Artifacte cards", () => {
    const state = resolveCardDetailActionState({
      card: createCard({ auctionListing: null, price: 0, seller: "seller-wallet" }),
      connected: true,
      viewerPublicKey: "buyer-wallet",
    });

    assert.equal(state.action.type, "none");
    assert.equal(state.showNotListedMessage, true);
    assert.equal(state.showMarketplaceLabel, false);
  });

  it("allows the seller to close a stale listing even when it is no longer buyable", () => {
    const state = resolveCardDetailActionState({
      card: createCard({
        auctionListing: createAuctionListing({ price: 0, seller: "seller-wallet", stale: true }),
        price: 0,
        seller: "seller-wallet",
      }),
      connected: true,
      viewerPublicKey: "seller-wallet",
    });

    assert.equal(state.action.type, "none");
    assert.equal(state.canCloseStaleListing, true);
    assert.equal(state.showNotListedMessage, true);
  });
});