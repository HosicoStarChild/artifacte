import { NextRequest, NextResponse } from "next/server";

export const runtime = "edge";

const ARWEAVE_GATEWAYS = [
  "https://gateway.irys.xyz",
  "https://ar-io.dev",
  "https://arweave.net",
];

const FETCH_TIMEOUT = 8000; // 8s per gateway attempt

function fetchWithTimeout(url: string, opts: RequestInit = {}, timeoutMs = FETCH_TIMEOUT): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  return fetch(url, { ...opts, signal: controller.signal }).finally(() => clearTimeout(timer));
}

export async function GET(req: NextRequest) {
  const url = req.nextUrl.searchParams.get("url");
  if (!url) return new NextResponse("Missing url", { status: 400 });

  // Validate URL hostname against allowlist (prevent SSRF)
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(url);
  } catch {
    return new NextResponse("Invalid URL", { status: 400 });
  }
  const hostname = parsedUrl.hostname;
  const allowedHosts = ["arweave.net", "gateway.irys.xyz", "ar-io.dev", "cdn.helius-rpc.com", "nftstorage.link", "dweb.link", "w3s.link", "cloudflare-ipfs.com"];
  const isIpfs = hostname.endsWith(".ipfs.nftstorage.link") || hostname.endsWith(".ipfs.dweb.link") || hostname.endsWith(".ipfs.w3s.link");
  const isArIoSubdomain = hostname.endsWith(".ar-io.dev");
  if (!allowedHosts.includes(hostname) && !isIpfs && !isArIoSubdomain && !hostname.endsWith(".mypinata.cloud")) {
    return new NextResponse("Domain not allowed", { status: 403 });
  }

  // Extract Arweave TX ID if present
  const arweaveMatch = url.match(/https?:\/\/(?:www\.)?arweave\.net\/([a-zA-Z0-9_-]+)/);

  if (arweaveMatch) {
    const txId = arweaveMatch[1];
    // Try multiple gateways with timeout
    for (const gw of ARWEAVE_GATEWAYS) {
      try {
        const res = await fetchWithTimeout(`${gw}/${txId}`, {
          headers: { Accept: "image/*" },
          redirect: "follow",
        });
        if (res.ok) {
          const contentType = res.headers.get("content-type") || "image/jpeg";
          return new NextResponse(res.body, {
            headers: {
              "Content-Type": contentType,
              "Cache-Control": "public, max-age=86400, s-maxage=604800",
              "Access-Control-Allow-Origin": "*",
            },
          });
        }
      } catch {
        continue;
      }
    }
    return new NextResponse("Image not found on any gateway", { status: 404 });
  }

  // Non-arweave URLs: direct fetch with timeout
  try {
    const res = await fetchWithTimeout(url, {
      headers: { Accept: "image/*" },
      redirect: "follow",
    });
    if (!res.ok) return new NextResponse("Upstream error", { status: res.status });
    const contentType = res.headers.get("content-type") || "image/jpeg";
    return new NextResponse(res.body, {
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=86400, s-maxage=604800",
        "Access-Control-Allow-Origin": "*",
      },
    });
  } catch {
    return new NextResponse("Fetch failed", { status: 502 });
  }
}
