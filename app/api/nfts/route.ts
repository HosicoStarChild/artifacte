import { NextRequest, NextResponse } from "next/server";

export const dynamic = 'force-dynamic';

const HELIUS_RPC = `https://mainnet.helius-rpc.com/?api-key=${process.env.HELIUS_API_KEY}`;

export async function GET(request: NextRequest) {
  try {
    const owner = request.nextUrl.searchParams.get("owner");
    if (!owner) {
      return NextResponse.json({ error: "Missing owner parameter" }, { status: 400 });
    }

    const collectionFilter = request.nextUrl.searchParams.get("collection");

    // Fetch all NFTs via Helius DAS
    let allAssets: any[] = [];
    let page = 1;

    while (true) {
      const res = await fetch(HELIUS_RPC, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: "nfts-list",
          method: "getAssetsByOwner",
          params: {
            ownerAddress: owner,
            page,
            limit: 1000,
            displayOptions: { showFungible: false, showNativeBalance: false },
          },
        }),
      });

      if (!res.ok) throw new Error(`Helius error: ${res.status}`);
      const data = await res.json();
      const items = data.result?.items || [];
      allAssets.push(...items);

      if (items.length < 1000) break;
      page++;
    }

    // Filter burned / compressed spam
    let filtered = allAssets.filter((a: any) => {
      if (a.burnt) return false;
      const iface = a.interface || "";
      return iface === "V1_NFT" || iface === "ProgrammableNFT" || iface === "V2_NFT";
    });

    // Filter by collection if provided
    if (collectionFilter) {
      filtered = filtered.filter((a: any) => {
        const grouping = a.grouping || [];
        const col = grouping.find((g: any) => g.group_key === "collection");
        if (col?.group_value === collectionFilter) return true;
        // Also check authorities for WNS/Token-2022
        const authorities = a.authorities || [];
        return authorities.some((auth: any) => auth.address === collectionFilter);
      });
    }

    const nfts = filtered.map((a: any) => {
      const content = a.content || {};
      const metadata = content.metadata || {};
      const links = content.links || {};
      const files = content.files || [];
      const grouping = a.grouping || [];
      const collection = grouping.find((g: any) => g.group_key === "collection");

      return {
        mint: a.id,
        name: metadata.name || "Untitled",
        image: links.image || files[0]?.uri || "/placeholder.png",
        collection: collection?.group_value || metadata.symbol || "Unknown",
      };
    });

    return NextResponse.json({ nfts, total: nfts.length });
  } catch (error) {
    console.error("Error fetching NFTs:", error);
    return NextResponse.json({ error: "Failed to fetch NFTs" }, { status: 500 });
  }
}
