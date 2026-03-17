import { NextRequest, NextResponse } from "next/server";

/**
 * Server-side proxy for Helius DAS (Digital Asset Standard) calls.
 * Keeps HELIUS_API_KEY off the client bundle.
 * Only allows specific safe DAS methods — no general RPC proxy.
 */

const HELIUS_RPC = `https://mainnet.helius-rpc.com/?api-key=${process.env.HELIUS_API_KEY}`;

// Simple in-memory rate limiter: max 30 requests per minute per IP
const rateMap = new Map<string, { count: number; resetAt: number }>();
function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = rateMap.get(ip);
  if (!entry || now > entry.resetAt) {
    rateMap.set(ip, { count: 1, resetAt: now + 60_000 });
    return true;
  }
  if (entry.count >= 30) return false;
  entry.count++;
  return true;
}

const ALLOWED_METHODS = new Set([
  "getAssetsByOwner",
  "getAsset",
  "getAssetBatch",
  "searchAssets",
]);

export async function POST(req: NextRequest) {
  try {
    const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
    if (!checkRateLimit(ip)) {
      return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 });
    }

    const body = await req.json();
    const { method, params, id } = body;

    if (!method || !ALLOWED_METHODS.has(method)) {
      return NextResponse.json(
        { error: `Method not allowed: ${method}` },
        { status: 403 }
      );
    }

    const res = await fetch(HELIUS_RPC, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: id || "das-proxy",
        method,
        params,
      }),
    });

    if (!res.ok) {
      return NextResponse.json(
        { error: `Helius error: ${res.status}` },
        { status: 502 }
      );
    }

    const data = await res.json();
    return NextResponse.json(data);
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || "DAS proxy error" },
      { status: 500 }
    );
  }
}
