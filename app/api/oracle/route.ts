import { NextRequest, NextResponse } from "next/server";

const ORACLE_API = "https://artifacte-oracle-production.up.railway.app";
const TIMEOUT_MS = 45000;

export const maxDuration = 60;

async function fetchWithTimeout(url: string, options: RequestInit = {}, timeoutMs: number = TIMEOUT_MS): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    clearTimeout(timeoutId);
    return response;
  } catch (error: any) {
    clearTimeout(timeoutId);
    throw error;
  }
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const endpoint = searchParams.get("endpoint");

    if (!endpoint) {
      return NextResponse.json({ error: "Missing endpoint parameter" }, { status: 400 });
    }

    let url: string;
    let responseType: "json" | "image" = "json";

    // Route requests to appropriate oracle endpoints
    if (endpoint === "market-search") {
      const q = searchParams.get("q");
      if (!q) {
        return NextResponse.json({ error: "Missing query parameter" }, { status: 400 });
      }
      url = `${ORACLE_API}/api/market/prices?card=${encodeURIComponent(q)}&limit=1`;
    } else if (endpoint === "chart-id") {
      const name = searchParams.get("name") || "";
      const grade = searchParams.get("grade") || "";
      const nft = searchParams.get("nft") || "";
      const params = new URLSearchParams();
      if (name) params.set("name", name);
      if (grade) params.set("grade", grade);
      if (nft) params.set("nft", nft);
      url = `${ORACLE_API}/api/market/chart-id?${params.toString()}`;
    } else if (endpoint === "search") {
      const q = searchParams.get("q");
      if (!q) {
        return NextResponse.json({ error: "Missing query parameter" }, { status: 400 });
      }
      url = `${ORACLE_API}/api/live/search?q=${encodeURIComponent(q)}`;
    } else if (endpoint === "chart") {
      const set = searchParams.get("set");
      const number = searchParams.get("number");
      const q = searchParams.get("q");
      const language = searchParams.get("language") || "";
      const variant = searchParams.get("variant") || "";
      const grade = searchParams.get("grade") || "";

      const assetId = searchParams.get("assetId") || "";
      const mint = searchParams.get("mint") || "";

      const params = new URLSearchParams();
      if (set) params.set("set", set);
      if (number) params.set("number", number);
      if (q) params.set("q", q);
      if (assetId) params.set("assetId", assetId);
      if (mint) params.set("mint", mint);
      if (language) params.set("language", language);
      if (variant) params.set("variant", variant);
      if (grade) params.set("grade", grade);

      if (!set && !number && !q && !assetId) {
        return NextResponse.json({ error: "Missing set+number, q, or assetId parameter" }, { status: 400 });
      }

      url = `${ORACLE_API}/api/live/chart?${params.toString()}`;
      responseType = "image";
    } else if (endpoint === "transactions") {
      const assetId = searchParams.get("assetId");
      const grade = searchParams.get("grade") || "";

      if (!assetId) {
        return NextResponse.json({ error: "Missing assetId parameter" }, { status: 400 });
      }

      const params = new URLSearchParams({ assetId });
      if (grade) params.append("grade", grade);

      url = `${ORACLE_API}/api/live/transactions?${params.toString()}`;
    } else if (endpoint === "sealed") {
      const q = searchParams.get("q") || "";
      const tcg = searchParams.get("tcg") || "";
      const type = searchParams.get("type") || "";
      const params = new URLSearchParams();
      if (q) params.set("q", q);
      if (tcg) params.set("tcg", tcg);
      if (type) params.set("type", type);
      url = `${ORACLE_API}/api/tcgplayer/sealed?${params.toString()}`;
    } else if (endpoint === "ungraded") {
      const number = searchParams.get("number") || "";
      const ccName = searchParams.get("ccName") || "";
      const variant = searchParams.get("variant") || "";
      if (!number && !ccName) {
        return NextResponse.json({ error: "Missing number or ccName parameter" }, { status: 400 });
      }
      const params = new URLSearchParams();
      if (number) params.set("number", number);
      if (ccName) params.set("ccName", ccName);
      if (variant) params.set("variant", variant);
      url = `${ORACLE_API}/api/tcgplayer/ungraded?${params.toString()}`;
    } else if (endpoint === "valuate") {
      const name = searchParams.get("name") || "";
      const nft = searchParams.get("nft") || "";
      if (!name && !nft) {
        return NextResponse.json({ error: "Missing name or nft parameter" }, { status: 400 });
      }
      if (nft) {
        url = `${ORACLE_API}/api/live/valuate?nft=${encodeURIComponent(nft)}`;
      } else {
        url = `${ORACLE_API}/api/live/valuate?name=${encodeURIComponent(name)}`;
      }
    } else if (endpoint === "cert") {
      const cert = searchParams.get("cert") || "";
      if (!cert) {
        return NextResponse.json({ error: "Missing cert parameter" }, { status: 400 });
      }
      url = `${ORACLE_API}/api/cert/${encodeURIComponent(cert)}`;
    } else if (endpoint === "cert-cgc") {
      const cert = searchParams.get("cert") || "";
      const gradeParam = searchParams.get("grade") || "";
      if (!cert) {
        return NextResponse.json({ error: "Missing cert parameter" }, { status: 400 });
      }
      url = `${ORACLE_API}/api/cert/cgc/${encodeURIComponent(cert)}?grade=${encodeURIComponent(gradeParam)}`;
    } else {
      return NextResponse.json({ error: "Invalid endpoint" }, { status: 400 });
    }

    // Fetch from oracle
    const response = await fetchWithTimeout(url, {}, TIMEOUT_MS);

    if (!response.ok) {
      return NextResponse.json(
        { error: `Oracle API error: ${response.statusText}` },
        { status: response.status }
      );
    }

    // Handle different response types
    if (responseType === "image") {
      // Return image as PNG
      const buffer = await response.arrayBuffer();
      return new NextResponse(buffer, {
        headers: {
          "Content-Type": "image/png",
          "Cache-Control": "public, s-maxage=300, stale-while-revalidate=60",
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET",
        },
      });
    } else {
      // Return JSON
      const data = await response.json();
      return NextResponse.json(data, {
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET",
          "Cache-Control": "public, max-age=300",
        },
      });
    }
  } catch (error: any) {
    console.error("Oracle API error:", error);

    // Handle timeout errors gracefully
    if (error.name === "AbortError") {
      return NextResponse.json(
        { error: "Oracle API timeout - price data unavailable" },
        { status: 504 }
      );
    }

    return NextResponse.json(
      { error: error.message || "Failed to fetch oracle data" },
      { status: 500 }
    );
  }
}

export async function OPTIONS(req: NextRequest) {
  return new NextResponse(null, {
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  });
}
