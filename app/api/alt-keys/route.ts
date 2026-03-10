import { NextResponse } from "next/server";

const GQL_URL = "https://alt-platform-server.production.internal.onlyalt.com/graphql/";
const GQL_QUERY = `query SearchServiceConfig {
  serviceConfig {
    search {
      liveListingSearch {
        clientConfig { nodes { host } apiKey }
        collectionName
        expiresAt
      }
      soldListingSearch {
        clientConfig { nodes { host } apiKey }
        collectionName
        expiresAt
      }
    }
  }
}`;

export async function GET() {
  try {
    const res = await fetch(GQL_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ operationName: "SearchServiceConfig", query: GQL_QUERY }),
      cache: "no-store",
    });

    if (!res.ok) {
      return NextResponse.json({ error: `GraphQL error: ${res.status}` }, { status: 502 });
    }

    const data = await res.json();
    return NextResponse.json(data, {
      headers: {
        "Cache-Control": "public, max-age=300",
        "Access-Control-Allow-Origin": "*",
      },
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
