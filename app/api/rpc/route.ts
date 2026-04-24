import { NextRequest, NextResponse } from "next/server";

import {
  createRateLimiter,
  ensureHeliusRpcUrl,
  getRequestIp,
  jsonError,
} from "@/app/api/_lib/list-route-utils";

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

const HOT_PATH_RPC_METHODS = new Set([
  "getFeeForMessage",
  "getLatestBlockhash",
  "getSignatureStatuses",
  "isBlockhashValid",
  "simulateTransaction",
]);

const READ_HEAVY_RPC_METHODS = new Set([
  "getAccountInfo",
  "getMultipleAccounts",
  "getProgramAccounts",
  "getTokenAccountsByOwner",
]);

const DEFAULT_RPC_RATE_LIMIT = createRateLimiter(90);
const HOT_PATH_RPC_RATE_LIMIT = createRateLimiter(300);
const READ_HEAVY_RPC_RATE_LIMIT = createRateLimiter(180);
const SEND_TRANSACTION_RATE_LIMIT = createRateLimiter(10);

type RateLimitBucket = "default" | "hot-path" | "read-heavy" | "send-transaction";

function resolveClientKey(request: NextRequest): string {
  const requestIp = getRequestIp(request.headers);

  if (requestIp !== "unknown") {
    return requestIp;
  }

  const origin = request.headers.get("origin")?.trim() || "unknown-origin";
  const userAgent = request.headers.get("user-agent")?.trim() || "unknown-user-agent";

  return `${requestIp}:${origin}:${userAgent}`;
}

function getRateLimitBucket(method: string): RateLimitBucket {
  if (method === "sendTransaction") {
    return "send-transaction";
  }

  if (HOT_PATH_RPC_METHODS.has(method)) {
    return "hot-path";
  }

  if (READ_HEAVY_RPC_METHODS.has(method)) {
    return "read-heavy";
  }

  return "default";
}

function checkMethodRateLimit(clientKey: string, method: string) {
  const bucket = getRateLimitBucket(method);

  if (bucket === "send-transaction") {
    return {
      allowed: SEND_TRANSACTION_RATE_LIMIT(clientKey),
      bucket,
      message: "Send rate limit exceeded",
    };
  }

  if (bucket === "hot-path") {
    return {
      allowed: HOT_PATH_RPC_RATE_LIMIT(clientKey),
      bucket,
      message: "Rate limit exceeded",
    };
  }

  if (bucket === "read-heavy") {
    return {
      allowed: READ_HEAVY_RPC_RATE_LIMIT(clientKey),
      bucket,
      message: "Rate limit exceeded",
    };
  }

  return {
    allowed: DEFAULT_RPC_RATE_LIMIT(clientKey),
    bucket,
    message: "Rate limit exceeded",
  };
}

function logLocalRateLimit(clientKey: string, method: string, bucket: RateLimitBucket) {
  console.warn(
    `[api/rpc] Local rate limit exceeded | method=${method} | bucket=${bucket} | client=${clientKey}`
  );
}

function parseRpcResponsePayload(payload: string): unknown {
  if (!payload) {
    return null;
  }

  try {
    return JSON.parse(payload) as unknown;
  } catch {
    return payload;
  }
}

export async function POST(req: NextRequest) {
  const clientKey = resolveClientKey(req);
  let method = "unknown";

  try {
    const body = (await req.json()) as Partial<{
      id?: number | string;
      jsonrpc?: string;
      method?: string;
      params?: unknown;
    }>;

    method = typeof body.method === "string" ? body.method : "";
    if (!method) {
      return jsonError("Missing RPC method", 400);
    }

    if (!ALLOWED_METHODS.has(method)) {
      return jsonError(`Method ${method} not allowed`, 403);
    }

    const rateLimitResult = checkMethodRateLimit(clientKey, method);
    if (!rateLimitResult.allowed) {
      logLocalRateLimit(clientKey, method, rateLimitResult.bucket);
      return jsonError(rateLimitResult.message, 429);
    }

    const rpcUrl = ensureHeliusRpcUrl();

    const res = await fetch(rpcUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    const responseText = await res.text();
    const responseBody = parseRpcResponsePayload(responseText);

    if (!res.ok) {
      console.warn(
        `[api/rpc] Upstream RPC responded with ${res.status} | method=${method} | client=${clientKey}`
      );
    }

    if (responseBody === null) {
      return new NextResponse(null, { status: res.status });
    }

    if (typeof responseBody === "object") {
      return NextResponse.json(responseBody, { status: res.status });
    }

    return NextResponse.json({ value: responseBody }, { status: res.status });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown RPC proxy error";
    console.error(
      `[api/rpc] Proxy error | method=${method || "unknown"} | client=${clientKey}`,
      error
    );
    return jsonError(message, 500);
  }
}
