import { NextRequest, NextResponse } from "next/server";

const ORACLE_API = "http://localhost:4567";
const TIMEOUT_MS = 10000;

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
    if (endpoint === "search") {
      const q = searchParams.get("q");
      if (!q) {
        return NextResponse.json({ error: "Missing query parameter" }, { status: 400 });
      }
      url = `${ORACLE_API}/api/live/search?q=${encodeURIComponent(q)}`;
    } else if (endpoint === "chart") {
      const set = searchParams.get("set");
      const number = searchParams.get("number");
      const language = searchParams.get("language") || "EN";
      const variant = searchParams.get("variant") || "";
      const grade = searchParams.get("grade") || "";

      if (!set || !number) {
        return NextResponse.json({ error: "Missing set or number parameter" }, { status: 400 });
      }

      const params = new URLSearchParams({
        set,
        number,
        language,
      });
      if (variant) params.append("variant", variant);
      if (grade) params.append("grade", grade);

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
          "Cache-Control": "public, max-age=3600",
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
