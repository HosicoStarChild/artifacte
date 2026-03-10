import { NextRequest, NextResponse } from "next/server";

export const runtime = "edge";

export async function GET(req: NextRequest) {
  const url = req.nextUrl.searchParams.get("url");
  if (!url) return new NextResponse("Missing url", { status: 400 });

  // Only allow arweave/ipfs/helius URLs
  const allowed = ["arweave.net", "irys.xyz", "ipfs", "helius-rpc.com", "nftstorage.link"];
  if (!allowed.some((d) => url.includes(d))) {
    return new NextResponse("Domain not allowed", { status: 403 });
  }

  try {
    const res = await fetch(url, {
      headers: { "Accept": "image/*" },
      redirect: "follow",
    });

    if (!res.ok) {
      return new NextResponse("Upstream error", { status: res.status });
    }

    const contentType = res.headers.get("content-type") || "image/jpeg";
    const body = res.body;

    return new NextResponse(body, {
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
