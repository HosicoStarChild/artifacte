import { NextRequest, NextResponse } from "next/server";

const HELIUS_RPC = `https://mainnet.helius-rpc.com/?api-key=${process.env.HELIUS_API_KEY}`;

// Rate limits per minute per IP
const rateLimit = new Map<string, { count: number; reset: number }>();
const sendRateLimit = new Map<string, { count: number; reset: number }>();
const RATE_LIMIT = 30;        // General: 30 req/min
const SEND_RATE_LIMIT = 5;    // sendTransaction: 5 req/min (prevents relay abuse)
const WINDOW_MS = 60000;

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = rateLimit.get(ip);
  if (!entry || now > entry.reset) {
    rateLimit.set(ip, { count: 1, reset: now + WINDOW_MS });
    return true;
  }
  if (entry.count >= RATE_LIMIT) return false;
  entry.count++;
  return true;
}

function checkSendRateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = sendRateLimit.get(ip);
  if (!entry || now > entry.reset) {
    sendRateLimit.set(ip, { count: 1, reset: now + WINDOW_MS });
    return true;
  }
  if (entry.count >= SEND_RATE_LIMIT) return false;
  entry.count++;
  return true;
}

// Allowed RPC methods (whitelist)
const ALLOWED_METHODS = new Set([
  "getAsset",
  "getAssetsByOwner",
  "getAssetsByGroup",
  "getAssetBatch",
  "searchAssets",
  "getBalance",
  "getLatestBlockhash",
  "getSignatureStatuses",
  "getSignaturesForAddress",
  "getTransaction",
  "sendTransaction",
  "getFeeForMessage",
  "simulateTransaction",
  "getAccountInfo",
  "getMultipleAccounts",
  "getTokenAccountsByOwner",
  "isBlockhashValid",
  "getProgramAccounts",
]);

export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip") || "unknown";
  
  if (!checkRateLimit(ip)) {
    return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 });
  }

  try {
    const body = await req.json();
    
    // Validate method is allowed
    if (body.method && !ALLOWED_METHODS.has(body.method)) {
      return NextResponse.json({ error: `Method ${body.method} not allowed` }, { status: 403 });
    }

    // Stricter rate limit for sendTransaction (prevents relay abuse)
    if (body.method === 'sendTransaction' && !checkSendRateLimit(ip)) {
      return NextResponse.json({ error: "Send rate limit exceeded" }, { status: 429 });
    }

    const res = await fetch(HELIUS_RPC, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    const data = await res.json();
    return NextResponse.json(data);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
