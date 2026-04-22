import { unstable_rethrow } from "next/navigation";
import { NextRequest, NextResponse } from "next/server";

import {
  buildNftLookupResponse,
  createRateLimiter,
  ensureHeliusRpcUrl,
  fetchHeliusRpc,
  getRequestIp,
  jsonError,
  parseMintAddress,
  type HeliusAssetResponse,
} from "@/app/api/_lib/list-route-utils";

const NFT_LOOKUP_RATE_LIMIT = createRateLimiter(30);

export async function GET(request: NextRequest) {
  try {
    const ip = getRequestIp(request.headers);
    if (!NFT_LOOKUP_RATE_LIMIT(ip)) {
      return jsonError("Rate limit exceeded.", 429);
    }

    const mint = parseMintAddress(request.nextUrl.searchParams.get("mint"));
    const rpcUrl = ensureHeliusRpcUrl();
    const payload = await fetchHeliusRpc<HeliusAssetResponse>(rpcUrl, {
      id: "nft-meta",
      jsonrpc: "2.0",
      method: "getAsset",
      params: { id: mint },
    });

    return NextResponse.json(buildNftLookupResponse(payload.result, mint), {
      headers: {
        "Cache-Control": "public, max-age=60, stale-while-revalidate=300",
      },
    });
  } catch (error) {
    unstable_rethrow(error);
    const message = error instanceof Error ? error.message : "Failed to fetch NFT metadata.";
    console.error("[nft]", message);
    return jsonError(message, 500);
  }
}
