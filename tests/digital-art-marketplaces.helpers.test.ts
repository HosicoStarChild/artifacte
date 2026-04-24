import assert from "node:assert";

import {
  buildMarketplaceState,
  createStaleMarketplaceResult,
  decodeCursor,
  dedupeMarketplaceListings,
  encodeCursor,
  normalizeMagicEdenListing,
  normalizeTensorListing,
  sortMarketplaceListings,
  type CuratedMarketplaceListingsResult,
  type ExternalMarketplaceListing,
  type HeliusAsset,
} from "../app/lib/digital-art-marketplaces.helpers.ts";

const COLLECTION_ADDRESS = "Collection1111111111111111111111111111111111";
const USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";

function createAsset(mint: string, compressed = false): HeliusAsset {
  return {
    id: mint,
    content: {
      metadata: {
        name: `Asset ${mint}`,
      },
      links: {
        image: `https://example.com/${mint}.png`,
      },
    },
    grouping: [{ group_key: "collection", group_value: COLLECTION_ADDRESS }],
    authorities: [],
    compression: {
      compressed,
    },
  };
}

function createListing(
  id: string,
  priceRaw: number,
  listedAt: number
): ExternalMarketplaceListing {
  return {
    id,
    source: "tensor",
    mint: `${id}-mint`,
    name: id,
    image: "/placeholder.png",
    collectionAddress: COLLECTION_ADDRESS,
    collectionName: "Test Collection",
    priceRaw,
    price: priceRaw / 1e9,
    currencySymbol: "SOL",
    currencyMint: "So11111111111111111111111111111111111111112",
    seller: "seller",
    listedAt,
    buyKind: "tensorStandard",
    marketplaceUrl: `https://example.com/${id}`,
  };
}

describe("digital-art-marketplaces helpers", () => {
  it("round-trips marketplace cursors", () => {
    const encoded = encodeCursor({
      meOffset: 24,
      tensorCursor: "cursor-123",
      meDone: true,
      tensorDone: false,
    });

    assert.deepEqual(decodeCursor(encoded), {
      meOffset: 24,
      tensorCursor: "cursor-123",
      meDone: true,
      tensorDone: false,
    });
  });

  it("merges unavailable sources when serving stale fallback results", () => {
    const fallback: CuratedMarketplaceListingsResult = {
      listings: [createListing("listing-a", 2_000_000_000, 100)],
      nextCursor: null,
      hasMore: false,
      state: buildMarketplaceState(["magiceden"], false, true),
    };

    const served = createStaleMarketplaceResult(
      fallback,
      buildMarketplaceState(["tensor"], false, false)
    );

    assert.equal(served.state.stale, true);
    assert.deepEqual(served.state.unavailableSources.sort(), ["magiceden", "tensor"]);
    assert.ok(served.state.warning?.includes("Magic Eden"));
    assert.ok(served.state.warning?.includes("Tensor"));
  });

  it("normalizes Magic Eden listings from fallback price fields", () => {
    const mint = "MagicMint11111111111111111111111111111111111";
    const assetMap = new Map([[mint, createAsset(mint)]]);
    const listing = normalizeMagicEdenListing(
      {
        mintAddress: mint,
        price: 0,
        priceInfo: { solPrice: 5.69 },
        seller: "magic-seller",
        listingSource: "M3",
        updatedAt: "2024-01-01T00:00:00.000Z",
      },
      assetMap,
      new Set([COLLECTION_ADDRESS]),
      COLLECTION_ADDRESS,
      "Magic Collection"
    );

    assert.ok(listing);
    if (!listing) {
      throw new Error("Expected Magic Eden listing to normalize");
    }

    assert.equal(listing.priceRaw, 5_690_000_000);
    assert.equal(listing.price, 5.69);
    assert.equal(listing.buyKind, "magicedenM3");
    assert.equal(listing.seller, "magic-seller");
  });

  it("normalizes Tensor listings with USDC pricing and compressed buy kind", () => {
    const mint = "TensorMint1111111111111111111111111111111111";
    const assetMap = new Map([[mint, createAsset(mint, true)]]);
    const listing = normalizeTensorListing(
      {
        mint: { onchainId: mint },
        listing: {
          currencyMint: USDC_MINT,
          price: 1_230_000,
          seller: "tensor-seller",
          updatedAt: 1_700_000_000,
        },
      },
      assetMap,
      new Set([COLLECTION_ADDRESS]),
      COLLECTION_ADDRESS,
      "Tensor Collection"
    );

    assert.ok(listing);
    if (!listing) {
      throw new Error("Expected Tensor listing to normalize");
    }

    assert.equal(listing.currencySymbol, "USDC");
    assert.equal(listing.priceRaw, 1_230_000);
    assert.equal(listing.price, 1.23);
    assert.equal(listing.buyKind, "tensorCompressed");
    assert.equal(listing.seller, "tensor-seller");
  });

  it("sorts by price then recency and removes duplicate ids", () => {
    const sorted = sortMarketplaceListings([
      createListing("listing-a", 2_000_000_000, 100),
      createListing("listing-b", 1_000_000_000, 150),
      createListing("listing-b", 1_000_000_000, 125),
    ]);

    const deduped = dedupeMarketplaceListings(sorted);

    assert.deepEqual(
      deduped.map((listing) => listing.id),
      ["listing-b", "listing-a"]
    );
    assert.equal(deduped[0]?.listedAt, 150);
  });
});