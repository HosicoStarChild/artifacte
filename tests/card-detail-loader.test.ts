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
});