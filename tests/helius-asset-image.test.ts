import assert from "node:assert";

import {
  buildNftImageFallbackPath,
  resolveHeliusAssetImageSrc,
  type ResolvableHeliusAsset,
} from "../lib/helius-asset-image.ts";

function createAsset(overrides: Partial<ResolvableHeliusAsset> = {}): ResolvableHeliusAsset {
  return {
    id: "Mint111111111111111111111111111111111111111",
    content: {},
    ...overrides,
  };
}

describe("resolveHeliusAssetImageSrc", () => {
  it("uses the first valid CDN image when present", () => {
    const asset = createAsset({
      content: {
        files: [
          {
            cdn_uri: "https://cdn.helius-rpc.com/cdn-cgi/image/width=512/plain/https://arweave.net/example.png",
          },
        ],
      },
    });

    assert.equal(
      resolveHeliusAssetImageSrc(asset),
      "https://cdn.helius-rpc.com/cdn-cgi/image/width=512/plain/https://arweave.net/example.png"
    );
  });

  it("normalizes ipfs image links through the proxyable gateway path", () => {
    const asset = createAsset({
      content: {
        links: {
          image: "ipfs://bafybeigdyrzt/image.webp",
        },
      },
    });

    assert.equal(
      resolveHeliusAssetImageSrc(asset),
      "/api/img-proxy?url=https%3A%2F%2Fnftstorage.link%2Fipfs%2Fbafybeigdyrzt%2Fimage.webp"
    );
  });

  it("skips metadata json files and uses the first actual image file", () => {
    const asset = createAsset({
      content: {
        files: [
          {
            uri: "https://arweave.net/metadata.json",
          },
          {
            mime: "image/png",
            uri: "https://arweave.net/image.png",
          },
        ],
      },
    });

    assert.equal(
      resolveHeliusAssetImageSrc(asset),
      "/api/img-proxy?url=https%3A%2F%2Farweave.net%2Fimage.png"
    );
  });

  it("falls back to the nft-image endpoint when DAS image fields are incomplete", () => {
    const asset = createAsset({
      content: {
        links: {
          image: "data:image/png;base64,broken",
        },
      },
    });

    assert.equal(
      resolveHeliusAssetImageSrc(asset),
      buildNftImageFallbackPath("Mint111111111111111111111111111111111111111")
    );
  });

  it("uses an explicit fallback mint when the asset payload omits the id", () => {
    assert.equal(
      resolveHeliusAssetImageSrc({ content: {} }, { fallbackMint: "Mint222" }),
      buildNftImageFallbackPath("Mint222")
    );
  });
});