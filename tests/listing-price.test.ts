import assert from "node:assert";

import { resolveListingPayablePrice } from "../lib/listing-price.ts";

describe("resolveListingPayablePrice", () => {
  it("adds the external 2% fee for marketplace card listings", () => {
    const result = resolveListingPayablePrice({
      price: 0.469,
      currency: "USDC",
      source: "phygitals",
      usdcPrice: 0.469,
    });

    assert.equal(result.feeApplied, true);
    assert.equal(result.baseAmount, 0.469);
    assert.ok(Math.abs(result.platformFeeAmount - 0.00938) < 1e-12);
    assert.ok(Math.abs(result.amount - 0.47838) < 1e-12);
  });

  it("does not add the external fee for Artifacte source listings", () => {
    const result = resolveListingPayablePrice({
      price: 25,
      currency: "USDC",
      source: "artifacte",
      usdcPrice: 25,
    });

    assert.equal(result.feeApplied, false);
    assert.equal(result.baseAmount, 25);
    assert.equal(result.platformFeeAmount, 0);
    assert.equal(result.amount, 25);
  });

  it("honors the Artifacte collection-name fee exemption", () => {
    const result = resolveListingPayablePrice(
      {
        price: 12,
        currency: "USDC",
        source: "collector-crypt",
        usdcPrice: 12,
      },
      {
        collectionName: "Artifacte Collection",
      },
    );

    assert.equal(result.feeApplied, false);
    assert.equal(result.platformFeeAmount, 0);
    assert.equal(result.amount, 12);
  });
});