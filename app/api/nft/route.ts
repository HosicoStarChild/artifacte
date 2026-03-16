import { NextRequest, NextResponse } from "next/server";

const HELIUS_RPC = `https://mainnet.helius-rpc.com/?api-key=${process.env.HELIUS_API_KEY}`;

export async function GET(request: NextRequest) {
  try {
    const mint = request.nextUrl.searchParams.get("mint");
    if (!mint) {
      return NextResponse.json({ error: "Missing mint parameter" }, { status: 400 });
    }

    const res = await fetch(HELIUS_RPC, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: "nft-meta",
        method: "getAsset",
        params: { id: mint },
      }),
    });

    if (!res.ok) throw new Error(`Helius error: ${res.status}`);
    const data = await res.json();
    const asset = data.result;

    if (!asset) {
      return NextResponse.json({
        nft: { mint, name: "NFT", image: "/placeholder.png", collection: "Unknown", description: "", symbol: "" },
      });
    }

    const content = asset.content || {};
    const metadata = content.metadata || {};
    const files = content.files || [];
    const links = content.links || {};
    const grouping = asset.grouping || [];
    const collection = grouping.find((g: any) => g.group_key === "collection");

    return NextResponse.json({
      nft: {
        mint,
        name: metadata.name || "Untitled",
        image: links.image || files[0]?.uri || "/placeholder.png",
        collection: collection?.group_value || metadata.symbol || "Unknown",
        description: metadata.description || "",
        symbol: metadata.symbol || "",
        royalty: asset.royalty || {},
        creators: asset.creators || [],
        mint_extensions: asset.mint_extensions || null,
        authorities: asset.authorities || [],
      },
    });
  } catch (error) {
    console.error("Error fetching NFT:", error);
    return NextResponse.json({ error: "Failed to fetch NFT metadata" }, { status: 500 });
  }
}
