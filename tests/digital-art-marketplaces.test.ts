import assert from "node:assert";

import {
  __resetDigitalArtMarketplaceCachesForTests,
  getCuratedMarketplaceListing,
} from "../app/lib/digital-art-marketplaces.ts";
import type {
  HeliusAsset,
  TensorListingRaw,
} from "../app/lib/digital-art-marketplaces.helpers.ts";

const COLLECTION_ADDRESS = "8Rt3Ayqth4DAiPnW9MDFi63TiQJHmohfTWLMQFHi4KZH";
const TARGET_MINT = "AePi8ef2NgJ9zYY3Ft7FySE9dQMgBpCQixE7pdneAAZe";
const OTHER_MINT = "3dL9ee5XK6f4r1HqWk9uJb5YdKc8Ts2mPx7QvVfN8UaL";
const SELLER = "tensor-seller";
const originalFetch = globalThis.fetch;
const originalConsoleError = console.error;
const originalConsoleWarn = console.warn;
const originalTensorApiKey = process.env.TENSOR_API_KEY;
const originalHeliusApiKey = process.env.HELIUS_API_KEY;

function createAsset(mint: string): HeliusAsset {
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
      compressed: false,
    },
  };
}

function createTensorListingRaw(mint: string): TensorListingRaw {
  return {
    mint: { onchainId: mint },
    listing: {
      price: 2_500_000_000,
      seller: SELLER,
      updatedAt: 1_700_000_000,
    },
  };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json",
    },
  });
}

function getUrl(input: RequestInfo | URL): string {
  if (typeof input === "string") {
    return input;
  }

  if (input instanceof URL) {
    return input.toString();
  }

  return input.url;
}

describe("digital-art-marketplaces resolver", () => {
  beforeEach(() => {
    __resetDigitalArtMarketplaceCachesForTests();
    process.env.TENSOR_API_KEY = "tensor-test-key";
    process.env.HELIUS_API_KEY = "helius-test-key";
    console.error = () => undefined;
    console.warn = () => undefined;
  });

  afterEach(() => {
    __resetDigitalArtMarketplaceCachesForTests();
    globalThis.fetch = originalFetch;
    console.error = originalConsoleError;
    console.warn = originalConsoleWarn;

    if (originalTensorApiKey === undefined) {
      delete process.env.TENSOR_API_KEY;
    } else {
      process.env.TENSOR_API_KEY = originalTensorApiKey;
    }

    if (originalHeliusApiKey === undefined) {
      delete process.env.HELIUS_API_KEY;
    } else {
      process.env.HELIUS_API_KEY = originalHeliusApiKey;
    }
  });

  it("falls back to later Tensor collection pages after a direct mint timeout", async () => {
    let directMintRequests = 0;
    let collectionRequests = 0;

    globalThis.fetch = (async (input) => {
      const url = getUrl(input);

      if (url.includes("mainnet.helius-rpc.com")) {
        return jsonResponse({
          result: [createAsset(TARGET_MINT)],
        });
      }

      if (url.includes("/collections/find_collection?filter=")) {
        return jsonResponse({ collId: "tensor-coll-id" });
      }

      if (url.includes("/mint?mints=")) {
        directMintRequests += 1;
        throw new TypeError("fetch failed");
      }

      if (url.includes("/mint/collection?")) {
        collectionRequests += 1;
        const cursor = new URL(url).searchParams.get("cursor");

        if (!cursor) {
          return jsonResponse({
            mints: [createTensorListingRaw(OTHER_MINT)],
            page: {
              endCursor: "cursor-2",
              hasMore: true,
            },
          });
        }

        assert.equal(cursor, "cursor-2");
        return jsonResponse({
          mints: [createTensorListingRaw(TARGET_MINT)],
          page: {
            endCursor: null,
            hasMore: false,
          },
        });
      }

      throw new Error(`Unexpected fetch URL: ${url}`);
    }) as typeof fetch;

    const listing = await getCuratedMarketplaceListing({
      collectionAddress: COLLECTION_ADDRESS,
      mint: TARGET_MINT,
      source: "tensor",
    });

    assert.ok(listing);
    assert.equal(listing?.mint, TARGET_MINT);
    assert.equal(listing?.seller, SELLER);
    assert.equal(directMintRequests, 1);
    assert.equal(collectionRequests, 2);
  });

  it("does not cache transient Tensor unavailability as a durable miss", async () => {
    let directMintRequests = 0;
    let collectionRequests = 0;

    globalThis.fetch = (async (input) => {
      const url = getUrl(input);

      if (url.includes("mainnet.helius-rpc.com")) {
        return jsonResponse({
          result: [createAsset(TARGET_MINT)],
        });
      }

      if (url.includes("/collections/find_collection?filter=")) {
        return jsonResponse({ collId: "tensor-coll-id" });
      }

      if (url.includes("/mint?mints=")) {
        directMintRequests += 1;

        if (directMintRequests === 1) {
          throw new TypeError("fetch failed");
        }

        return jsonResponse({
          mints: [createTensorListingRaw(TARGET_MINT)],
        });
      }

      if (url.includes("/mint/collection?")) {
        collectionRequests += 1;

        if (directMintRequests === 1) {
          throw new TypeError("collection timeout");
        }

        return jsonResponse({
          mints: [],
          page: {
            endCursor: null,
            hasMore: false,
          },
        });
      }

      throw new Error(`Unexpected fetch URL: ${url}`);
    }) as typeof fetch;

    const firstResult = await getCuratedMarketplaceListing({
      collectionAddress: COLLECTION_ADDRESS,
      mint: TARGET_MINT,
      source: "tensor",
    });

    const secondResult = await getCuratedMarketplaceListing({
      collectionAddress: COLLECTION_ADDRESS,
      mint: TARGET_MINT,
      source: "tensor",
    });

    assert.equal(firstResult, null);
    assert.ok(secondResult);
    assert.equal(secondResult?.mint, TARGET_MINT);
    assert.equal(directMintRequests, 2);
    assert.equal(collectionRequests, 1);
  });
});