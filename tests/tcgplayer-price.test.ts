import assert from "node:assert";

import {
  fetchTcgPlayerProductPrice,
  resolveTcgPlayerPriceValue,
  selectBestTcgPlayerPricePoint,
} from "../lib/server/tcgplayer-price.ts";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json",
    },
  });
}

describe("fetchTcgPlayerProductPrice", () => {
  it("prefers Near Mint foil over lower-priority pricepoints", async () => {
    const price = await fetchTcgPlayerProductPrice("123456", {
      fetchImpl: async (input) => {
        assert.equal(input, "https://mpapi.tcgplayer.com/v2/product/123456/pricepoints");

        return jsonResponse([
          {
            condition: "Near Mint",
            listedMedianPrice: 14.75,
            marketPrice: 14.5,
            printingType: "Normal",
          },
          {
            condition: "Lightly Played",
            listedMedianPrice: 18.2,
            marketPrice: 18,
            printingType: "Foil",
          },
          {
            condition: "Near Mint",
            listedMedianPrice: 19.97,
            marketPrice: 19.97,
            printingType: "Foil",
          },
        ]);
      },
    });

    assert.equal(price.productId, "123456");
    assert.equal(price.condition, "Near Mint");
    assert.equal(price.printingType, "Foil");
    assert.equal(price.marketPrice, 19.97);
    assert.equal(resolveTcgPlayerPriceValue(price), 19.97);
  });

  it("falls back to listed median when the selected pricepoint has no market price", () => {
    const selected = selectBestTcgPlayerPricePoint([
      {
        condition: "Near Mint",
        listedMedianPrice: 11.25,
        marketPrice: null,
        printingType: "Normal",
      },
    ]);

    assert.deepEqual(selected, {
      condition: "Near Mint",
      listedMedianPrice: 11.25,
      marketPrice: null,
      printingType: "Normal",
    });
    assert.equal(resolveTcgPlayerPriceValue(selected || {}), 11.25);
  });
});