import { NextRequest, NextResponse } from "next/server";

export const runtime = "edge";

const ARWEAVE_GATEWAYS = [
  "https://gateway.irys.xyz",
  "https://ar-io.dev",
  "https://arweave.net",
];

export async function GET(req: NextRequest) {
  const url = req.nextUrl.searchParams.get("url");
  if (!url) return new NextResponse("Missing url", { status: 400 });

  const allowed = ["arweave.net", "irys.xyz", "ipfs", "helius-rpc.com", "nftstorage.link", "ar-io.dev"];
  if (!allowed.some((d) => url.includes(d))) {
    return new NextResponse("Domain not allowed", { status: 403 });
  }

  // Extract Arweave TX ID if present
  const arweaveMatch = url.match(/https?:\/\/(?:www\.)?arweave\.net\/([a-zA-Z0-9_-]+)/);

  if (arweaveMatch) {
    const txId = arweaveMatch[1];
    // Try multiple gateways
    for (const gw of ARWEAVE_GATEWAYS) {
      try {
        const res = await fetch(`${gw}/${txId}`, {
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

  // Non-arweave URLs: direct fetch
  try {
    const res = await fetch(url, {
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
