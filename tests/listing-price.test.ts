import assert from "node:assert";

import {
  resolveExternalMarketplacePayablePrice,
  resolveListingPayablePrice,
} from "../lib/listing-price.ts";

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

describe("resolveExternalMarketplacePayablePrice", () => {
  it("adds royalty and the external 2% fee for marketplace listings", () => {
    const result = resolveExternalMarketplacePayablePrice({
      price: 0.7715,
      currencySymbol: "SOL",
      currency: "SOL",
      source: "tensor",
      royaltyBasisPoints: 500,
    });

    assert.equal(result.baseAmount, 0.7715);
    assert.equal(result.royaltyBasisPoints, 500);
    assert.equal(result.currency, "SOL");
    assert.ok(Math.abs(result.royaltyAmount - 0.038575) < 1e-12);
    assert.ok(Math.abs(result.platformFeeAmount - 0.01543) < 1e-12);
    assert.ok(Math.abs(result.amount - 0.825505) < 1e-12);
  });

  it("uses currencySymbol when external listings do not provide a currency field", () => {
    const result = resolveExternalMarketplacePayablePrice({
      price: 0.7715,
      currencySymbol: "SOL",
      source: "tensor",
      royaltyBasisPoints: 500,
    });

    assert.equal(result.currency, "SOL");
  });

  it("keeps royalties but skips the Artifacte fee for exempt collections", () => {
    const result = resolveExternalMarketplacePayablePrice(
      {
        price: 1.25,
        currencySymbol: "SOL",
        currency: "SOL",
        source: "tensor",
        royaltyBasisPoints: 500,
      },
      {
        collectionName: "Artifacte Collection",
      },
    );

    assert.equal(result.feeApplied, false);
    assert.equal(result.platformFeeAmount, 0);
    assert.ok(Math.abs(result.royaltyAmount - 0.0625) < 1e-12);
    assert.ok(Math.abs(result.amount - 1.3125) < 1e-12);
  });
});