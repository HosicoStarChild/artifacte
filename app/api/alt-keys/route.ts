import { NextResponse } from "next/server";

const GQL_URL = "https://alt-platform-server.production.internal.onlyalt.com/graphql/";

const SOLD_QUERY = `query SearchServiceConfig {
  serviceConfig {
    search {
      soldListingSearch {
        clientConfig { nodes { host } apiKey }
        collectionName
        expiresAt
      }
    }
  }
}`;

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const type = searchParams.get("type") || "sold";

    const query = SOLD_QUERY;

    const res = await fetch(GQL_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ operationName: "SearchServiceConfig", query }),
      cache: "no-store",
    });

    if (!res.ok) {
      const text = await res.text();
      return NextResponse.json({ error: `GraphQL error: ${res.status}`, detail: text.slice(0, 200) }, { status: 502 });
    }

    const data = await res.json();
    if (data.errors) {
      return NextResponse.json({ error: "GraphQL errors", details: data.errors }, { status: 502 });
    }

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
