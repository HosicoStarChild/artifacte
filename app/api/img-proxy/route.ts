import { NextRequest, NextResponse } from "next/server";

const ARWEAVE_GATEWAYS = [
  "https://gateway.irys.xyz",
  "https://ar-io.dev",
  "https://arweave.net",
];

const FETCH_TIMEOUT = 5000; // Give Arweave gateway fallbacks enough time without hanging the grid.

function fetchWithTimeout(url: string, opts: RequestInit = {}, timeoutMs = FETCH_TIMEOUT): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  return fetch(url, { ...opts, signal: controller.signal }).finally(() => clearTimeout(timer));
}

function redirectToPlaceholder(request: NextRequest): NextResponse {
  return NextResponse.redirect(new URL("/placeholder.png", request.url));
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
  const allowedHosts = ["arweave.net", "www.arweave.net", "gateway.irys.xyz", "ar-io.dev", "cdn.helius-rpc.com", "nftstorage.link", "dweb.link", "w3s.link", "cloudflare-ipfs.com"];
  const isIpfs = hostname.endsWith(".ipfs.nftstorage.link") || hostname.endsWith(".ipfs.dweb.link") || hostname.endsWith(".ipfs.w3s.link");
  const isArIoSubdomain = hostname.endsWith(".ar-io.dev");
  if (!allowedHosts.includes(hostname) && !isIpfs && !isArIoSubdomain && !hostname.endsWith(".mypinata.cloud")) {
    return new NextResponse("Domain not allowed", { status: 403 });
  }

  // Extract IPFS CID + path if present
  const ipfsMatch = url.match(/\/ipfs\/([a-zA-Z0-9]+)(\/.*)?/) || url.match(/([a-zA-Z0-9]+)\.ipfs\.[^/]+(\/.*)?/);
  if (ipfsMatch) {
    const cid = ipfsMatch[1];
    const path = ipfsMatch[2] || "";
    const IPFS_GATEWAYS = [
      `https://w3s.link/ipfs/${cid}${path}`,
      `https://ipfs.io/ipfs/${cid}${path}`,
      `https://cloudflare-ipfs.com/ipfs/${cid}${path}`,
      `https://dweb.link/ipfs/${cid}${path}`,
    ];
    for (const gwUrl of IPFS_GATEWAYS) {
      try {
        const res = await fetchWithTimeout(gwUrl, {
          headers: { Accept: "image/*" },
          redirect: "follow",
        });
        if (res.ok) {
          const contentType = res.headers.get("content-type") || "image/png";
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
    return redirectToPlaceholder(req);
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
    return redirectToPlaceholder(req);
  }

  // Non-arweave URLs: direct fetch with timeout
  try {
    const res = await fetchWithTimeout(url, {
      headers: { Accept: "image/*" },
      redirect: "follow",
    });
    if (!res.ok) return redirectToPlaceholder(req);
    const contentType = res.headers.get("content-type") || "image/jpeg";
    return new NextResponse(res.body, {
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=86400, s-maxage=604800",
        "Access-Control-Allow-Origin": "*",
      },
    });
  } catch {
    return redirectToPlaceholder(req);
  }
}
