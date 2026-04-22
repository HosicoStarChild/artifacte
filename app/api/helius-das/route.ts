import { NextRequest, NextResponse } from "next/server";

import {
  createRateLimiter,
  ensureHeliusRpcUrl,
  fetchHeliusRpc,
  getRequestIp,
  jsonError,
  parseDasProxyRequest,
} from "@/app/api/_lib/list-route-utils";

/**
 * Server-side proxy for Helius DAS (Digital Asset Standard) calls.
 * Keeps HELIUS_API_KEY off the client bundle.
 * Only allows specific safe DAS methods — no general RPC proxy.
 */

const HELIUS_DAS_RATE_LIMIT = createRateLimiter(30);

export async function POST(req: NextRequest) {
  try {
    const ip = getRequestIp(req.headers);
    if (!HELIUS_DAS_RATE_LIMIT(ip)) {
      return jsonError("Rate limit exceeded.", 429);
    }

    const body = (await req.json()) as Partial<{
      id?: number | string;
      method?: string;
      params?: Record<string, boolean | number | string | Record<string, boolean | number | string>>;
    }>;
    const parsedRequest = parseDasProxyRequest(body);
    const rpcUrl = ensureHeliusRpcUrl();
    const data = await fetchHeliusRpc<object>(rpcUrl, {
      id: parsedRequest.id,
      jsonrpc: "2.0",
      method: parsedRequest.method,
      params: parsedRequest.params,
    });

    return NextResponse.json(data);
  } catch (error) {
    const message = error instanceof Error ? error.message : "DAS proxy error.";
    return jsonError(message, 500);
  }
}
