import { NextRequest, NextResponse } from "next/server";
import { Connection, PublicKey } from "@solana/web3.js";
import * as anchor from "@coral-xyz/anchor";

const HELIUS_RPC = `https://mainnet.helius-rpc.com/?api-key=${process.env.HELIUS_API_KEY}`;
const AUCTION_PROGRAM_ID = new PublicKey("81s1tEx4MPdVvqS6X84Mok5K4N5fMbRLzcsT5eo2K8J3");

export async function GET(request: NextRequest) {
  try {
    const collection = request.nextUrl.searchParams.get("collection");
    const conn = new Connection(HELIUS_RPC);

    // Fetch all listing accounts from the program
    const accounts = await conn.getProgramAccounts(AUCTION_PROGRAM_ID, {
      filters: [
        { dataSize: 240 }, // Listing account size
      ],
    });

    const listings = [];
    for (const { pubkey, account } of accounts) {
      try {
        const data = account.data;
        // Parse Listing struct (after 8-byte discriminator):
        // seller(32) + nft_mint(32) + payment_mint(32) + price(8) + listing_type(1) + category(1)
        // + start_time(8) + end_time(8) + status(1) + escrow_nft_account(32) + current_bid(8)
        // + highest_bidder(32) + baxus_fee(1) + is_token2022(1) + royalty_basis_points(2) + creator_address(32) + bump(1)
        const seller = new PublicKey(data.slice(8, 40));
        const nftMint = new PublicKey(data.slice(40, 72));
        const paymentMint = new PublicKey(data.slice(72, 104));
        const price = data.readBigUInt64LE(104);
        const listingType = data[112]; // 0=FixedPrice, 1=Auction
        const category = data[113];
        const startTime = Number(data.readBigInt64LE(114));
        const endTime = Number(data.readBigInt64LE(122));
        const status = data[130]; // 0=Active, 1=Settled, 2=Cancelled
        const currentBid = data.readBigUInt64LE(163);
        const highestBidder = new PublicKey(data.slice(171, 203));
        const royaltyBps = data.readUInt16LE(205);

        // Only active listings
        if (status !== 0) continue;

        // Fetch NFT metadata
        const metaRes = await fetch(HELIUS_RPC, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            jsonrpc: "2.0",
            id: "nft",
            method: "getAsset",
            params: { id: nftMint.toBase58() },
          }),
        });
        const metaData = await metaRes.json();
        const asset = metaData.result;
        const nftName = asset?.content?.metadata?.name || "Unknown";
        const nftImage = asset?.content?.links?.image || asset?.content?.files?.[0]?.uri || "/placeholder.png";
        const nftCollection = asset?.grouping?.find((g: any) => g.group_key === "collection")?.group_value || "";
        const authorities = asset?.authorities?.[0]?.address || "";

        // Filter by collection if requested
        if (collection && nftCollection !== collection && authorities !== collection) continue;

        listings.push({
          pda: pubkey.toBase58(),
          seller: seller.toBase58(),
          nftMint: nftMint.toBase58(),
          nftName,
          nftImage,
          nftCollection,
          price: Number(price) / 1e9,
          listingType: listingType === 0 ? "fixed" : "auction",
          category,
          startTime,
          endTime,
          status: "active",
          currentBid: Number(currentBid) / 1e9,
          highestBidder: highestBidder.toBase58(),
          royaltyBps,
        });
      } catch (e) {
        // Skip unparseable accounts
      }
    }

    return NextResponse.json({ listings });
  } catch (error) {
    console.error("Error fetching on-chain listings:", error);
    return NextResponse.json({ listings: [], error: "Failed to fetch listings" }, { status: 500 });
  }
}
