import assert from "node:assert";

import { loadCardDetail } from "../app/auctions/cards/[id]/_lib/card-detail.ts";

const originalFetch = globalThis.fetch;
const originalConsoleError = console.error;

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

function createConnectionStub() {
  return {
    getAccountInfo: async () => null,
  };
}

describe("loadCardDetail", () => {
  beforeEach(() => {
    console.error = () => undefined;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    console.error = originalConsoleError;
  });

  it("keeps merchandise Phygitals listings on the listed detail path", async () => {
    const mint = "So11111111111111111111111111111111111111112";
    const cardId = `phyg-${mint}`;

    globalThis.fetch = (async (input) => {
      const url = getUrl(input);

      if (url.startsWith("/api/me-listings?")) {
        const parsedUrl = new URL(url, "http://localhost");
        assert.equal(parsedUrl.searchParams.get("source"), "phygitals");
        assert.equal(parsedUrl.searchParams.get("q"), cardId);
        assert.equal(parsedUrl.searchParams.get("category"), null);

        return jsonResponse({
          listings: [
            {
              category: "MERCHANDISE",
              currency: "USDC",
              id: cardId,
              image: "https://example.com/fwog.png",
              name: "FWOG Single Pack",
              nftAddress: mint,
              price: 149,
              seller: "seller-wallet",
              source: "phygitals",
              subtitle: "Fwog • Phygital",
              usdcPrice: 149,
            },
          ],
        });
      }

      if (url === `/api/nft?mint=${mint}`) {
        return jsonResponse({
          result: {
            content: {
              links: {
                image: "https://example.com/fwog.png",
              },
              metadata: {
                attributes: [],
                name: "FWOG Single Pack",
              },
            },
            id: mint,
            name: "FWOG Single Pack",
          },
        });
      }

      throw new Error(`Unexpected fetch URL: ${url}`);
    }) as typeof fetch;

    const card = await loadCardDetail(cardId, createConnectionStub() as never);

    assert.ok(card);
    assert.equal(card?.category, "MERCHANDISE");
    assert.equal(card?.currency, "USDC");
    assert.equal(card?.price, 149);
    assert.equal(card?.source, "phygitals");
  });

  it("matches sealed oracle listings by the full listing id", async () => {
    const cardId = "cc-sealed-123";
    const mint = "So11111111111111111111111111111111111111112";
    const queries: string[] = [];

    globalThis.fetch = (async (input) => {
      const url = getUrl(input);

      if (url.startsWith("/api/me-listings?")) {
        const parsedUrl = new URL(url, "http://localhost");
        const query = parsedUrl.searchParams.get("q") || "";
        queries.push(query);

        if (query === cardId) {
          return jsonResponse({
            listings: [
              {
                category: "SEALED",
                currency: "USDC",
                id: cardId,
                image: "https://example.com/sealed.png",
                name: "Sealed Booster Box",
                nftAddress: mint,
                price: 0,
                seller: "seller-wallet",
                source: "collector-crypt",
                subtitle: "Pokemon • Sealed",
                usdcPrice: 245,
              },
            ],
          });
        }

        return jsonResponse({ listings: [] });
      }

      throw new Error(`Unexpected fetch URL: ${url}`);
    }) as typeof fetch;

    const card = await loadCardDetail(cardId, createConnectionStub() as never);

    assert.ok(card);
    assert.deepEqual(queries, [cardId]);
    assert.equal(card?.category, "SEALED");
    assert.equal(card?.nftAddress, mint);
    assert.equal(card?.price, 245);
  });

  it("prefers the on-chain phygital price source id over stale oracle fallback ids", async () => {
    const mint = "PriceSource1111111111111111111111111111111111";
    const cardId = `phyg-${mint}`;

    globalThis.fetch = (async (input) => {
      const url = getUrl(input);

      if (url.startsWith("/api/me-listings?")) {
        return jsonResponse({
          listings: [
            {
              category: "TCG_CARDS",
              currency: "USDC",
              id: cardId,
              image: "https://example.com/pikachu.png",
              name: "Pikachu",
              nftAddress: mint,
              price: 25,
              priceSource: "TCGplayer",
              priceSourceId: "111111",
              seller: "seller-wallet",
              source: "phygitals",
              subtitle: "Pokemon • Base Set • Phygital",
              tcgPlayerId: "111111",
              usdcPrice: 25,
            },
          ],
        });
      }

      if (url === `/api/nft?mint=${mint}`) {
        return jsonResponse({
          result: {
            content: {
              links: {
                image: "https://example.com/pikachu.png",
              },
              metadata: {
                attributes: [
                  { trait_type: "Price Source", value: "TCGplayer" },
                  { trait_type: "Price Source ID", value: "222222" },
                  { trait_type: "Set", value: "Base Set" },
                  { trait_type: "TCG", value: "Pokemon" },
                ],
                name: "Pikachu",
              },
            },
            id: mint,
            name: "Pikachu",
          },
        });
      }

      throw new Error(`Unexpected fetch URL: ${url}`);
    }) as typeof fetch;

    const card = await loadCardDetail(cardId, createConnectionStub() as never);

    assert.ok(card);
    assert.equal(card?.priceSource, "TCGplayer");
    assert.equal(card?.priceSourceId, "222222");
    assert.equal(card?.tcgPlayerId, "222222");
  });

  it("resolves the on-chain phygital price source id on bare address detail routes", async () => {
    const mint = "PriceSourceBare111111111111111111111111111111";
    const cardId = mint;

    globalThis.fetch = (async (input) => {
      const url = getUrl(input);

      if (url.startsWith("/api/me-listings?")) {
        const parsedUrl = new URL(url, "http://localhost");
        const query = parsedUrl.searchParams.get("q");
        const source = parsedUrl.searchParams.get("source");

        if (query === mint && !source) {
          return jsonResponse({ listings: [] });
        }

        if (query === `phyg-${mint}` && source === "phygitals") {
          return jsonResponse({
            listings: [
              {
                category: "TCG_CARDS",
                currency: "USDC",
                id: `phyg-${mint}`,
                image: "https://example.com/charizard.png",
                name: "Charizard",
                nftAddress: mint,
                price: 125,
                priceSource: "TCGplayer",
                priceSourceId: "333333",
                seller: "seller-wallet",
                source: "phygitals",
                subtitle: "Pokemon • Base Set • Phygital",
                tcgPlayerId: "333333",
                usdcPrice: 125,
              },
            ],
          });
        }

        throw new Error(`Unexpected me-listings query: ${url}`);
      }

      if (url === `/api/nft?mint=${mint}`) {
        return jsonResponse({
          result: {
            content: {
              links: {
                image: "https://example.com/charizard.png",
              },
              metadata: {
                attributes: [
                  { trait_type: "Price Source", value: "TCGplayer" },
                  { trait_type: "Price Source ID", value: "444444" },
                  { trait_type: "Set", value: "Base Set" },
                  { trait_type: "TCG", value: "Pokemon" },
                ],
                name: "Charizard",
              },
            },
            grouping: [
              {
                group_key: "collection",
                group_value: "BSG6DyEihFFtfvxtL9mKYsvTwiZXB1rq5gARMTJC2xAM",
              },
            ],
            id: mint,
            name: "Charizard",
          },
        });
      }

      throw new Error(`Unexpected fetch URL: ${url}`);
    }) as typeof fetch;

    const card = await loadCardDetail(cardId, createConnectionStub() as never);

    assert.ok(card);
    assert.equal(card?.source, "phygitals");
    assert.equal(card?.priceSource, "TCGplayer");
    assert.equal(card?.priceSourceId, "444444");
    assert.equal(card?.tcgPlayerId, "444444");
  });
});