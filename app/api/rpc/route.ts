import { NextRequest, NextResponse } from "next/server";

import {
  createRateLimiter,
  getSolanaRpcUpstreamUrls,
  getRequestIp,
  jsonError,
  withRequestTimeout,
} from "@/app/api/_lib/list-route-utils";

type JsonPrimitive = boolean | number | null | string;
type JsonObject = { [key: string]: JsonValue };
type JsonValue = JsonObject | JsonPrimitive | JsonValue[];
type JsonRpcParams = JsonObject | JsonValue[];

const DEFAULT_RPC_METHODS = [
  "getAsset",
  "getAssetsByOwner",
  "getAssetsByGroup",
  "getAssetBatch",
  "searchAssets",
  "getBalance",
  "getSignaturesForAddress",
  "getTransaction",
] as const;

const HOT_PATH_RPC_METHODS = [
  "getBlockHeight",
  "getFeeForMessage",
  "getLatestBlockhash",
  "getRecentPrioritizationFees",
  "getSignatureStatuses",
  "getSlot",
  "isBlockhashValid",
  "simulateTransaction",
] as const;

const READ_HEAVY_RPC_METHODS = [
  "getAccountInfo",
  "getMultipleAccounts",
  "getProgramAccounts",
  "getTokenAccountsByOwner",
] as const;

const CLUSTER_INFO_RPC_METHODS = [
  "getEpochInfo",
  "getGenesisHash",
  "getMinimumBalanceForRentExemption",
  "getVersion",
] as const;

const SEND_TRANSACTION_RPC_METHODS = ["sendTransaction"] as const;

type AllowedRpcMethod =
  | (typeof DEFAULT_RPC_METHODS)[number]
  | (typeof HOT_PATH_RPC_METHODS)[number]
  | (typeof READ_HEAVY_RPC_METHODS)[number]
  | (typeof CLUSTER_INFO_RPC_METHODS)[number]
  | (typeof SEND_TRANSACTION_RPC_METHODS)[number];

const ALLOWED_METHODS = new Set<AllowedRpcMethod>([
  ...DEFAULT_RPC_METHODS,
  ...HOT_PATH_RPC_METHODS,
  ...READ_HEAVY_RPC_METHODS,
  ...CLUSTER_INFO_RPC_METHODS,
  ...SEND_TRANSACTION_RPC_METHODS,
]);

const HOT_PATH_RPC_METHOD_SET = new Set<AllowedRpcMethod>(HOT_PATH_RPC_METHODS);
const READ_HEAVY_RPC_METHOD_SET = new Set<AllowedRpcMethod>(READ_HEAVY_RPC_METHODS);
const CLUSTER_INFO_RPC_METHOD_SET = new Set<AllowedRpcMethod>(CLUSTER_INFO_RPC_METHODS);
const SEND_TRANSACTION_RPC_METHOD_SET = new Set<AllowedRpcMethod>(SEND_TRANSACTION_RPC_METHODS);

type RateLimitBucket = "cluster-info" | "default" | "hot-path" | "read-heavy" | "send-transaction";

interface RpcProxyRequestBody {
  id?: number | string;
  jsonrpc?: string;
  method?: string;
  params?: JsonValue;
}

interface ParsedRpcProxyRequest {
  id: number | string;
  jsonrpc: "2.0";
  method: AllowedRpcMethod;
  params?: JsonRpcParams;
}

interface RateLimitResult {
  allowed: boolean;
  bucket: RateLimitBucket;
  message: string;
}

class RpcProxyRouteError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "RpcProxyRouteError";
  }
}

const RATE_LIMITERS: Record<RateLimitBucket, (key: string) => boolean> = {
  "cluster-info": createRateLimiter(120),
  default: createRateLimiter(90),
  "hot-path": createRateLimiter(300),
  "read-heavy": createRateLimiter(180),
  "send-transaction": createRateLimiter(10),
};

const RATE_LIMIT_MESSAGES: Record<RateLimitBucket, string> = {
  "cluster-info": "Rate limit exceeded",
  default: "Rate limit exceeded",
  "hot-path": "Rate limit exceeded",
  "read-heavy": "Rate limit exceeded",
  "send-transaction": "Send rate limit exceeded",
};

function resolveClientKey(request: NextRequest): string {
  const requestIp = getRequestIp(request.headers);

  if (requestIp !== "unknown") {
    return requestIp;
  }

  const origin = request.headers.get("origin")?.trim() || "unknown-origin";
  const userAgent = request.headers.get("user-agent")?.trim() || "unknown-user-agent";

  return `${requestIp}:${origin}:${userAgent}`;
}

function isPlainJsonObject(value: JsonValue): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isJsonRpcParams(value: JsonValue): value is JsonRpcParams {
  return Array.isArray(value) || isPlainJsonObject(value);
}

function isAllowedRpcMethod(method: string): method is AllowedRpcMethod {
  return ALLOWED_METHODS.has(method as AllowedRpcMethod);
}

function parseRpcProxyRequest(body: Partial<RpcProxyRequestBody>): ParsedRpcProxyRequest {
  if (body.jsonrpc !== undefined && body.jsonrpc !== "2.0") {
    throw new RpcProxyRouteError("Invalid JSON-RPC version", 400);
  }

  if (!body.method) {
    throw new RpcProxyRouteError("Missing RPC method", 400);
  }

  if (!isAllowedRpcMethod(body.method)) {
    throw new RpcProxyRouteError(`Method ${body.method} not allowed`, 403);
  }

  if (body.params !== undefined && !isJsonRpcParams(body.params)) {
    throw new RpcProxyRouteError("Invalid RPC params", 400);
  }

  return {
    id: body.id ?? "rpc-proxy",
    jsonrpc: "2.0",
    method: body.method,
    ...(body.params !== undefined ? { params: body.params } : {}),
  };
}

function getRateLimitBucket(method: AllowedRpcMethod): RateLimitBucket {
  if (SEND_TRANSACTION_RPC_METHOD_SET.has(method)) {
    return "send-transaction";
  }

  if (HOT_PATH_RPC_METHOD_SET.has(method)) {
    return "hot-path";
  }

  if (READ_HEAVY_RPC_METHOD_SET.has(method)) {
    return "read-heavy";
  }

  if (CLUSTER_INFO_RPC_METHOD_SET.has(method)) {
    return "cluster-info";
  }

  return "default";
}

function checkMethodRateLimit(clientKey: string, method: AllowedRpcMethod): RateLimitResult {
  const bucket = getRateLimitBucket(method);

  return {
    allowed: RATE_LIMITERS[bucket](clientKey),
    bucket,
    message: RATE_LIMIT_MESSAGES[bucket],
  };
}

function logLocalRateLimit(clientKey: string, method: AllowedRpcMethod, bucket: RateLimitBucket) {
  console.warn(
    `[api/rpc] Local rate limit exceeded | method=${method} | bucket=${bucket} | client=${clientKey}`
  );
}

function logDeniedMethod(request: NextRequest, clientKey: string, method: string) {
  const origin = request.headers.get("origin")?.trim() || "unknown-origin";
  const userAgent = request.headers.get("user-agent")?.trim() || "unknown-user-agent";

  console.warn(
    `[api/rpc] Denied RPC method | method=${method} | client=${clientKey} | origin=${origin} | userAgent=${userAgent}`
  );
}

function getRpcFetchErrorCode(error: unknown): string | null {
  if (!(error instanceof Error)) {
    return null;
  }

  const cause = error.cause;
  if (typeof cause !== "object" || cause === null || !("code" in cause)) {
    return null;
  }

  return typeof cause.code === "string" ? cause.code : null;
}

function getRpcProxyErrorStatus(error: unknown): number {
  if (!(error instanceof Error)) {
    return 500;
  }

  const code = getRpcFetchErrorCode(error);
  if (
    error.name === "AbortError" ||
    code === "UND_ERR_CONNECT_TIMEOUT" ||
    code === "ECONNREFUSED" ||
    code === "ENOTFOUND" ||
    code === "EHOSTUNREACH"
  ) {
    return 504;
  }

  return 500;
}

async function forwardRpcRequest(
  parsedRequest: ParsedRpcProxyRequest,
  upstreamUrls: readonly string[],
  method: AllowedRpcMethod,
  clientKey: string,
): Promise<Response> {
  let lastError: unknown = null;
  let lastResponse: Response | null = null;
  const failedUpstreams: string[] = [];

  for (const rpcUrl of upstreamUrls) {
    try {
      const response = await fetch(rpcUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(parsedRequest),
        signal: withRequestTimeout(),
      });

      if (response.ok) {
        return response;
      }

      lastResponse = response;
      failedUpstreams.push(`${rpcUrl} -> HTTP ${response.status}`);
    } catch (error) {
      lastError = error;
      const errorMessage = error instanceof Error ? error.message : "Unknown upstream RPC error";
      failedUpstreams.push(`${rpcUrl} -> ${errorMessage}`);
    }
  }

  if (lastResponse) {
    console.warn(
      `[api/rpc] All upstream RPCs failed | method=${method} | client=${clientKey} | attempts=${failedUpstreams.join("; ")}`
    );
    return lastResponse;
  }

  throw lastError ?? new Error("Failed to reach any configured RPC upstream");
}

export async function POST(req: NextRequest) {
  const clientKey = resolveClientKey(req);
  let method: AllowedRpcMethod | "unknown" = "unknown";
  let requestedMethod = "unknown";

  try {
    const body = (await req.json()) as Partial<RpcProxyRequestBody>;
    requestedMethod = body.method?.trim() || "unknown";
    const parsedRequest = parseRpcProxyRequest(body);
    method = parsedRequest.method;

    const rateLimitResult = checkMethodRateLimit(clientKey, method);
    if (!rateLimitResult.allowed) {
      logLocalRateLimit(clientKey, method, rateLimitResult.bucket);
      return jsonError(rateLimitResult.message, 429);
    }

    const res = await forwardRpcRequest(
      parsedRequest,
      getSolanaRpcUpstreamUrls(),
      method,
      clientKey,
    );

    const responseText = await res.text();

    if (responseText.length === 0) {
      return new NextResponse(null, { status: res.status });
    }

    return new NextResponse(responseText, {
      status: res.status,
      headers: {
        "Cache-Control": "no-store",
        "Content-Type": res.headers.get("content-type") ?? "application/json; charset=utf-8",
      },
    });
  } catch (error) {
    if (error instanceof RpcProxyRouteError) {
      if (error.status === 403 && requestedMethod !== "unknown") {
        logDeniedMethod(req, clientKey, requestedMethod);
      }

      return jsonError(error.message, error.status);
    }

    const message = error instanceof Error ? error.message : "Unknown RPC proxy error";
    console.error(
      `[api/rpc] Proxy error | method=${method || "unknown"} | client=${clientKey}`,
      error
    );
    return jsonError(message, getRpcProxyErrorStatus(error));
  }
}
