import { NextRequest, NextResponse } from "next/server";
import { Connection, PublicKey } from "@solana/web3.js";

export const dynamic = 'force-dynamic';

const HELIUS_RPC = `https://mainnet.helius-rpc.com/?api-key=${process.env.HELIUS_API_KEY}`;
const AUCTION_PROGRAM_ID = new PublicKey("81s1tEx4MPdVvqS6X84Mok5K4N5fMbRLzcsT5eo2K8J3");
const ARTIFACTE_AUTHORITY = "DDSpvAK8DbuAdEaaBHkfLieLPSJVCWWgquFAA3pvxXoX";
const LISTING_ACCOUNT_SIZE = 240;

// Listing account layout (after 8-byte discriminator):
// seller(32) + nftMint(32) + paymentMint(32) + price(8) + listingType(1) + category(1)
// + startTime(8) + endTime(8) + status(1) + ...
const OFFSET_SELLER = 8;
const OFFSET_NFT_MINT = 40;
const OFFSET_PRICE = 104;
const OFFSET_LISTING_TYPE = 112; // 0=FixedPrice, 1=Auction
const OFFSET_STATUS = 130;       // 0=Active, 1=Settled, 2=Cancelled

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl;
    const page = Math.max(1, parseInt(searchParams.get("page") || "1"));
    const perPage = Math.min(100, Math.max(1, parseInt(searchParams.get("perPage") || "24")));
    const sort = searchParams.get("sort") || "price-desc"; // price-asc | price-desc
    const q = searchParams.get("q") || "";

    const conn = new Connection(HELIUS_RPC);

    // Fetch all Artifacte program listing accounts of the expected size
    const accounts = await conn.getProgramAccounts(AUCTION_PROGRAM_ID, {
      filters: [{ dataSize: LISTING_ACCOUNT_SIZE }],
    });

    // Parse and filter to active fixed-price listings only
    type RawListing = { nftMint: string; price: bigint };
    const activeMints: RawListing[] = [];
    for (const { account } of accounts) {
      const data = account.data;
      try {
        const listingType = data[OFFSET_LISTING_TYPE]; // 0=FixedPrice
        const status = data[OFFSET_STATUS];             // 0=Active
        if (listingType !== 0 || status !== 0) continue;
        const nftMint = new PublicKey(data.slice(OFFSET_NFT_MINT, OFFSET_NFT_MINT + 32)).toBase58();
        const price = data.readBigUInt64LE(OFFSET_PRICE); // micro-USDC (1e6)
        activeMints.push({ nftMint, price });
      } catch {
        // Skip unparseable accounts
      }
    }

    if (activeMints.length === 0) {
      return NextResponse.json({ listings: [], total: 0 });
    }

    // Batch fetch NFT metadata from Helius DAS (getAssetBatch)
    const mintAddresses = activeMints.map((m) => m.nftMint);
    const dasRes = await fetch(HELIUS_RPC, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: "batch",
        method: "getAssetBatch",
        params: { ids: mintAddresses },
      }),
    });
    const dasData = await dasRes.json();
    const assets: any[] = dasData.result || [];

    // Build a map from mint → asset for quick lookup
    const assetMap = new Map<string, any>();
    for (const asset of assets) {
      if (asset?.id) assetMap.set(asset.id, asset);
    }

    // Filter to Artifacte authority NFTs and build listing objects
    const listings: any[] = [];
    for (const { nftMint, price } of activeMints) {
      const asset = assetMap.get(nftMint);
      if (!asset) continue;

      // Only include NFTs with the Artifacte update authority
      const authorities: { address: string }[] = asset.authorities || [];
      if (!authorities.some((a) => a.address === ARTIFACTE_AUTHORITY)) continue;

      const name: string = asset.content?.metadata?.name || "Unnamed";
      // Skip if search query doesn't match name
      if (q && !name.toLowerCase().includes(q.toLowerCase())) continue;

      // Prefer CDN URI, fallback to links.image
      let image: string = asset.content?.files?.[0]?.cdn_uri || asset.content?.links?.image || "/placeholder.png";
      if (image.startsWith("ipfs://")) {
        image = image.replace("ipfs://", "https://nftstorage.link/ipfs/");
      }
      if (
        image.includes("arweave.net/") ||
        image.includes("nftstorage.link/") ||
        image.includes("/ipfs/") ||
        image.includes("irys.xyz/")
      ) {
        image = `/api/img-proxy?url=${encodeURIComponent(image)}`;
      }

      const usdcPrice = Number(price) / 1e6;
      const attrs: { trait_type: string; value: string }[] = asset.content?.metadata?.attributes || [];
      const subtitle = attrs.find((a) => a.trait_type === "Card Name")?.value ||
        attrs.find((a) => a.trait_type === "Set")?.value || "";

      listings.push({
        id: nftMint,
        nftAddress: nftMint,
        name,
        subtitle,
        image,
        price: usdcPrice,
        usdcPrice,
        currency: "USDC",
        source: "artifacte",
        marketplace: "artifacte",
      });
    }

    // Sort
    listings.sort((a, b) => {
      if (sort === "price-asc") return a.usdcPrice - b.usdcPrice;
      return b.usdcPrice - a.usdcPrice; // price-desc (default)
    });

    const total = listings.length;
    const start = (page - 1) * perPage;
    const paginated = listings.slice(start, start + perPage);

    return NextResponse.json({ listings: paginated, total });
  } catch (error) {
    console.error("[artifacte-program-listings] error:", error);
    return NextResponse.json({ listings: [], total: 0, error: "Failed to fetch listings" }, { status: 500 });
  }
}
