import { NextRequest, NextResponse } from "next/server";

const ALT_GQL_URL = process.env.ALT_GQL_URL || "https://alt-platform-server.production.internal.onlyalt.com/graphql/";
const FETCH_TIMEOUT_MS = 8000;

const SEARCH_SERVICE_CONFIG_QUERY = `query SearchServiceConfig {
  serviceConfig {
    search {
      soldListingSearch {
        clientConfig { nodes { host } apiKey }
        collectionName
        expiresAt
      }
      universalSearch {
        clientConfig { nodes { host } apiKey }
        collectionName
        expiresAt
      }
    }
  }
}`;

export const maxDuration = 15;

function fetchWithTimeout(url: string, options: RequestInit = {}, timeoutMs: number = FETCH_TIMEOUT_MS): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  return fetch(url, {
    ...options,
    cache: "no-store",
    signal: controller.signal,
  }).finally(() => clearTimeout(timeoutId));
}

function hasSearchConfig(payload: any): boolean {
  const search = payload?.data?.serviceConfig?.search;
  const sold = search?.soldListingSearch;
  return Boolean(sold?.clientConfig?.apiKey && sold?.clientConfig?.nodes?.[0]?.host && sold?.collectionName);
}

export async function GET(_req: NextRequest) {
  try {
    const res = await fetchWithTimeout(ALT_GQL_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        operationName: "SearchServiceConfig",
        query: SEARCH_SERVICE_CONFIG_QUERY,
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      return NextResponse.json(
        { error: `GraphQL error: ${res.status}`, detail: text.slice(0, 200) },
        { status: 502 }
      );
    }

    const data = await res.json();
    if (data?.errors) {
      return NextResponse.json({ error: "GraphQL errors", details: data.errors }, { status: 502 });
    }

    if (!hasSearchConfig(data)) {
      return NextResponse.json({ error: "SearchServiceConfig payload missing search keys" }, { status: 502 });
    }

    return NextResponse.json(data, {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Cache-Control": "public, max-age=300, s-maxage=300, stale-while-revalidate=60",
      },
    });
  } catch (error: any) {
    const status = error?.name === "AbortError" ? 504 : 500;
    return NextResponse.json(
      { error: error?.message || "Failed to fetch Alt search config" },
      { status }
    );
  }
}
