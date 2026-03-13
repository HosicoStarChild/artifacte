import { NextRequest, NextResponse } from "next/server";

// Simplified NFT metadata endpoint
// In production, this would fetch from Metaplex, Shyft, or Helius APIs
export async function GET(request: NextRequest) {
  try {
    const mint = request.nextUrl.searchParams.get("mint");

    if (!mint) {
      return NextResponse.json(
        { error: "Missing mint parameter" },
        { status: 400 }
      );
    }

    // Try to fetch from Shyft API (free tier available)
    try {
      const shyftRes = await fetch(
        `https://api.shyft.to/sol/v1/nft/compressed_search?network=mainnet&mint=${mint}`,
        {
          headers: {
            "x-api-key": process.env.SHYFT_API_KEY || "test-key",
          },
        }
      );

      if (shyftRes.ok) {
        const data = await shyftRes.json();
        const nftData = data.result?.nft || data.result?.[0];

        if (nftData) {
          return NextResponse.json({
            nft: {
              mint: nftData.mint || mint,
              name: nftData.name || nftData.title || "Untitled",
              image: nftData.image || nftData.image_uri || "/placeholder.png",
              collection: nftData.collection?.name || nftData.collection || "Unknown",
              description: nftData.description || "",
              symbol: nftData.symbol || "",
            },
          });
        }
      }
    } catch (shyftErr) {
      console.error("Shyft API error:", shyftErr);
    }

    // Fallback: Return basic NFT structure
    // Frontend will still work with listing data from on-chain
    return NextResponse.json({
      nft: {
        mint,
        name: "NFT",
        image: "/placeholder.png",
        collection: "Unknown Collection",
        description: "",
        symbol: "",
      },
    });
  } catch (error) {
    console.error("Error fetching NFT:", error);
    return NextResponse.json(
      { error: "Failed to fetch NFT metadata" },
      { status: 500 }
    );
  }
}
