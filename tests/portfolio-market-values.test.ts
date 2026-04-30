import assert from "node:assert";

import { resolvePortfolioRwaMarketValueMap } from "../lib/server/portfolio-market-values.ts";

describe("resolvePortfolioRwaMarketValueMap", () => {
  it("prefers the live TCGplayer product price over the oracle indexed fallback", async () => {
    const marketValues = await resolvePortfolioRwaMarketValueMap(
      [
        {
          name: "2024 Energy Marker Gold #E01-05",
          nftAddress: "mint-tcg-live",
          priceSourceId: "123456",
        },
        {
          name: "Other oracle-priced card",
          nftAddress: "mint-oracle-only",
        },
      ],
      {
        fetchOracleMarketValueMap: async () => ({
          "mint-oracle-only": {
            price: 42,
            source: "oracle",
          },
          "mint-tcg-live": {
            price: 156.93,
            source: "tcgplayer_index_product",
          },
        }),
        fetchTcgPlayerProductPrice: async (productId) => ({
          condition: "Near Mint",
          listedMedianPrice: 19.97,
          marketPrice: 19.97,
          printingType: "Foil",
          productId,
        }),
      }
    );

    assert.deepEqual(marketValues, {
      "mint-oracle-only": {
        price: 42,
        source: "oracle",
      },
      "mint-tcg-live": {
        price: 19.97,
        source: "tcgplayer_live",
      },
    });
  });

  it("keeps the oracle value when the live TCGplayer lookup fails", async () => {
    const marketValues = await resolvePortfolioRwaMarketValueMap(
      [
        {
          name: "Fallback card",
          nftAddress: "mint-tcg-fallback",
          priceSourceId: "654321",
        },
      ],
      {
        fetchOracleMarketValueMap: async () => ({
          "mint-tcg-fallback": {
            price: 88.5,
            source: "tcgplayer_index_product",
          },
        }),
        fetchTcgPlayerProductPrice: async () => {
          throw new Error("upstream down");
        },
      }
    );

    assert.deepEqual(marketValues, {
      "mint-tcg-fallback": {
        price: 88.5,
        source: "tcgplayer_index_product",
      },
    });
  });
});