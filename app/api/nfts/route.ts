import { NextRequest, NextResponse } from "next/server";

// Simplified NFTs endpoint for user's wallet
// In production, this would fetch from Metaplex, Shyft, or Helius APIs
export async function GET(request: NextRequest) {
  try {
    const owner = request.nextUrl.searchParams.get("owner");
    const collectionFilter = request.nextUrl.searchParams.get("collection");

    if (!owner) {
      return NextResponse.json(
        { error: "Missing owner parameter" },
        { status: 400 }
      );
    }

    // Try to fetch from Shyft API (free tier available)
    try {
      const shyftRes = await fetch(
        `https://api.shyft.to/sol/v1/nft/read_all?network=mainnet&wallet=${owner}`,
        {
          headers: {
            "x-api-key": process.env.SHYFT_API_KEY || "test-key",
          },
        }
      );

      if (shyftRes.ok) {
        const data = await shyftRes.json();
        const nfts = data.result || [];

        // Filter by collection if provided
        let filtered = nfts;
        if (collectionFilter) {
          filtered = nfts.filter(
            (nft: any) =>
              nft.collection?.address === collectionFilter ||
              nft.collection?.name === collectionFilter ||
              nft.collection === collectionFilter
          );
        }

        // Transform to response format
        const result = filtered.map((nft: any) => ({
          mint: nft.mint || nft.address,
          name: nft.name || nft.title || "Untitled",
          image: nft.image || nft.image_uri || "/placeholder.png",
          collection: nft.collection?.name || nft.collection || "Unknown",
        }));

        return NextResponse.json({
          nfts: result,
          total: result.length,
        });
      }
    } catch (shyftErr) {
      console.error("Shyft API error:", shyftErr);
    }

    // Fallback: Return empty array
    // Frontend will handle gracefully
    return NextResponse.json({
      nfts: [],
      total: 0,
    });
  } catch (error) {
    console.error("Error fetching NFTs:", error);
    return NextResponse.json(
      { error: "Failed to fetch NFTs" },
      { status: 500 }
    );
  }
}
