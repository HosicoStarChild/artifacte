"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import { useWallet, useConnection, useAnchorWallet } from "@solana/wallet-adapter-react";
import { PublicKey } from "@solana/web3.js";
import { getAssociatedTokenAddress, createAssociatedTokenAccountInstruction, TOKEN_2022_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID } from "@solana/spl-token";
import Link from "next/link";
import { AuctionProgram } from "@/lib/auction-program";
import { showToast } from "@/components/ToastContainer";
import { AuctionCountdownTimer } from "@/components/AuctionCountdownTimer";
import { BidHistory } from "@/components/BidHistory";

const SOL_MINT = new PublicKey("So11111111111111111111111111111111111111112");
const TREASURY = new PublicKey("6drXw31FjHch4ixXa4ngTyUD2cySUs3mpcB2YYGA9g7P");

interface ListingData {
  seller: string;
  nftMint: string;
  price: number;
  listingType: { fixedPrice?: {}; auction?: {} };
  status: { active?: {}; settled?: {}; cancelled?: {} };
  endTime: number;
  currentBid: number;
  highestBidder: string;
  escrowNftAccount: string;
  royaltyBasisPoints: number;
  creatorAddress: string;
}

interface NFTData {
  name: string;
  image: string;
  collection: string;
}

export default function AuctionDetailPage() {
  const params = useParams();
  const mint = params.mint as string;
  const { publicKey, connected, sendTransaction } = useWallet();
  const wallet = useAnchorWallet();
  const { connection } = useConnection();

  const [listing, setListing] = useState<ListingData | null>(null);
  const [nft, setNFT] = useState<NFTData | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingAction, setLoadingAction] = useState(false);

  const [bidAmount, setBidAmount] = useState("");
  const [auctionEnded, setAuctionEnded] = useState(false);

  useEffect(() => {
    loadListingData();
  }, [mint]);

  const loadListingData = async () => {
    setLoading(true);
    try {
      const nftMint = new PublicKey(mint);
      const dummyWallet = { publicKey: PublicKey.default, signTransaction: async (tx: any) => tx, signAllTransactions: async (txs: any) => txs };
      const auctionProgram = new AuctionProgram(connection, dummyWallet as any);

      // Fetch listing from on-chain
      const listingData = await auctionProgram.fetchListing(nftMint);

      if (!listingData) {
        showToast.error("Listing not found");
        return;
      }

      // Convert BN values to numbers and Pubkeys to strings
      setListing({
        ...listingData,
        seller: listingData.seller?.toBase58?.() || listingData.seller,
        nftMint: listingData.nftMint?.toBase58?.() || listingData.nftMint,
        price: listingData.price?.toNumber?.() || Number(listingData.price),
        endTime: listingData.endTime?.toNumber?.() || Number(listingData.endTime),
        currentBid: listingData.currentBid?.toNumber?.() || Number(listingData.currentBid),
        highestBidder: listingData.highestBidder?.toBase58?.() || listingData.highestBidder,
        escrowNftAccount: listingData.escrowNftAccount?.toBase58?.() || listingData.escrowNftAccount,
        creatorAddress: listingData.creatorAddress?.toBase58?.() || listingData.creatorAddress,
        royaltyBasisPoints: listingData.royaltyBasisPoints || 0,
      });

      // Fetch NFT metadata
      try {
        const res = await fetch(`/api/nft?mint=${mint}`);
        const data = await res.json();
        setNFT(data.nft || null);
      } catch (err) {
        console.error("Failed to fetch NFT metadata:", err);
      }
    } catch (err) {
      console.error("Failed to load listing:", err);
      showToast.error("Failed to load listing");
    } finally {
      setLoading(false);
    }
  };

  const isFixedPrice = listing?.listingType?.fixedPrice !== undefined;
  const isAuction = listing?.listingType?.auction !== undefined;
  const isSeller = listing?.seller === publicKey?.toBase58();
  const isSettled = listing?.status?.settled !== undefined;
  const isCancelled = listing?.status?.cancelled !== undefined;

  const handleBuyNow = async () => {
    if (!publicKey || !connected || !wallet || !listing || !nft) {
      showToast.error("Please connect your wallet first");
      return;
    }

    setLoadingAction(true);
    try {
      const nftMint = new PublicKey(mint);

      // Detect Token-2022 for correct ATA derivation
      const mintInfoBuy = await connection.getAccountInfo(nftMint);
      const isT22Buy = mintInfoBuy?.owner.equals(TOKEN_2022_PROGRAM_ID) || false;
      const nftProgBuy = isT22Buy ? TOKEN_2022_PROGRAM_ID : new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");

      const buyerPaymentAccount = await getAssociatedTokenAddress(SOL_MINT, publicKey);
      const sellerPaymentAccount = await getAssociatedTokenAddress(SOL_MINT, new PublicKey(listing.seller));
      const buyerNftAccount = await getAssociatedTokenAddress(nftMint, publicKey, false, nftProgBuy);

      const auctionProgram = new AuctionProgram(connection, wallet, sendTransaction);
      const tx = await auctionProgram.buyNow(
        nftMint,
        sellerPaymentAccount,
        buyerPaymentAccount,
        buyerNftAccount,
        listing.price,
        SOL_MINT
      );

      showToast.success("Purchase successful!");
      setListing((prev: any) => prev ? { ...prev, status: { settled: {} } } : prev);
    } catch (err: any) {
      console.error("Purchase failed:", err);
      showToast.error(err.message || "Purchase failed");
    } finally {
      setLoadingAction(false);
    }
  };

  const handlePlaceBid = async () => {
    if (!publicKey || !connected || !wallet || !listing) {
      showToast.error("Please connect your wallet first");
      return;
    }

    if (!bidAmount || parseFloat(bidAmount) <= 0) {
      showToast.error("Please enter a valid bid amount");
      return;
    }

    const newBidLamports = Math.floor(parseFloat(bidAmount) * 1e9);
    const MIN_INCREMENT = 0.1 * 1e9; // 0.1 SOL
    const minBid = listing.currentBid > 0
      ? listing.currentBid + MIN_INCREMENT
      : listing.price;

    if (newBidLamports < minBid) {
      showToast.error(`Minimum bid is ◎ ${(minBid / 1e9).toFixed(4)}`);
      return;
    }

    setLoadingAction(true);
    try {
      const nftMint = new PublicKey(mint);
      const bidderTokenAccount = await getAssociatedTokenAddress(SOL_MINT, publicKey);
      // UncheckedAccount on-chain — safe to pass any pubkey when no previous bidder
      const previousBidderAccount = listing.currentBid > 0
        ? await getAssociatedTokenAddress(SOL_MINT, new PublicKey(listing.highestBidder))
        : publicKey;

      const auctionProgram = new AuctionProgram(connection, wallet, sendTransaction);
      const tx = await auctionProgram.placeBid(
        nftMint,
        newBidLamports,
        bidderTokenAccount,
        SOL_MINT,
        previousBidderAccount
      );

      showToast.success("Bid placed successfully!");
      setBidAmount("");
      setTimeout(() => loadListingData(), 2000);
    } catch (err: any) {
      console.error("Bid failed:", err);
      showToast.error(err.message || "Bid failed");
    } finally {
      setLoadingAction(false);
    }
  };

  const handleSettleAuction = async () => {
    if (!publicKey || !connected || !wallet || !listing) {
      showToast.error("Please connect your wallet first");
      return;
    }

    setLoadingAction(true);
    try {
      const nftMint = new PublicKey(mint);

      // Detect if Token-2022 mint (WNS/Quekz etc.)
      const mintInfo = await connection.getAccountInfo(nftMint);
      const isT22 = mintInfo?.owner.equals(TOKEN_2022_PROGRAM_ID) || false;
      const nftTokenProgramId = isT22 ? TOKEN_2022_PROGRAM_ID : new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");

      const sellerPaymentAccount = await getAssociatedTokenAddress(SOL_MINT, new PublicKey(listing.seller));
      const buyerNftAccount = await getAssociatedTokenAddress(nftMint, new PublicKey(listing.highestBidder), false, nftTokenProgramId);
      const sellerNftAccount = await getAssociatedTokenAddress(nftMint, new PublicKey(listing.seller), false, nftTokenProgramId);

      const auctionProgram = new AuctionProgram(connection, wallet, sendTransaction);
      const tx = await auctionProgram.settleAuction(
        nftMint,
        sellerPaymentAccount,
        buyerNftAccount,
        sellerNftAccount,
        SOL_MINT
      );

      showToast.success("Auction settled successfully!");
      // Update local state instead of reloading (listing PDA is closed after settle)
      setListing((prev: any) => prev ? { ...prev, status: { settled: {} } } : prev);
    } catch (err: any) {
      console.error("Settlement failed:", err);
      showToast.error(err.message || "Settlement failed");
    } finally {
      setLoadingAction(false);
    }
  };

  const handleCancelListing = async () => {
    if (!publicKey || !connected || !wallet || !listing) {
      showToast.error("Please connect your wallet first");
      return;
    }

    setLoadingAction(true);
    try {
      const nftMint = new PublicKey(mint);

      // Detect if Token-2022 mint
      const mintInfo = await connection.getAccountInfo(nftMint);
      const isT22 = mintInfo?.owner.equals(TOKEN_2022_PROGRAM_ID) || false;
      const tokenProgramId = isT22 ? TOKEN_2022_PROGRAM_ID : new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");

      const sellerNftAccount = await getAssociatedTokenAddress(nftMint, publicKey, false, tokenProgramId);

      // Create ATA if it doesn't exist (closed when NFT was escrowed)
      const ataInfo = await connection.getAccountInfo(sellerNftAccount);
      if (!ataInfo) {
        const createAtaIx = createAssociatedTokenAccountInstruction(
          publicKey,
          sellerNftAccount,
          publicKey,
          nftMint,
          tokenProgramId,
          ASSOCIATED_TOKEN_PROGRAM_ID
        );
        const { blockhash } = await connection.getLatestBlockhash();
        const ataTx = new (await import("@solana/web3.js")).Transaction().add(createAtaIx);
        ataTx.recentBlockhash = blockhash;
        ataTx.feePayer = publicKey;
        const signed = await wallet.signTransaction(ataTx);
        await connection.sendRawTransaction(signed.serialize());
        // Wait for ATA to be created
        await new Promise(r => setTimeout(r, 2000));
      }

      const auctionProgram = new AuctionProgram(connection, wallet, sendTransaction);
      const tx = await auctionProgram.cancelListing(nftMint, sellerNftAccount);

      showToast.success("Listing cancelled successfully!");
      setListing((prev: any) => prev ? { ...prev, status: { cancelled: {} } } : prev);
    } catch (err: any) {
      console.error("Cancellation failed:", err);
      showToast.error(err.message || "Cancellation failed");
    } finally {
      setLoadingAction(false);
    }
  };

  if (loading) {
    return (
      <div className="pt-24 pb-20 min-h-screen">
        <div className="max-w-4xl mx-auto px-4">
          <div className="text-center">
            <div className="inline-block animate-spin mb-4">
              <div className="w-8 h-8 border-4 border-gray-700 border-t-gold-500 rounded-full" />
            </div>
            <p className="text-gray-400">Loading listing...</p>
          </div>
        </div>
      </div>
    );
  }

  if (!listing) {
    return (
      <div className="pt-24 pb-20 min-h-screen">
        <div className="max-w-4xl mx-auto px-4">
          <Link href="/digital-art" className="text-gold-500 hover:text-gold-400 text-sm font-medium transition mb-6 inline-block">
            ← Back to Digital Collectibles
          </Link>
          <div className="bg-dark-800 border border-white/10 rounded-xl p-12 text-center">
            <div className="text-5xl mb-4">🔍</div>
            <h2 className="font-serif text-2xl text-white mb-4">Listing Not Found</h2>
            <p className="text-gray-400">This listing does not exist or has been removed.</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="pt-24 pb-20 min-h-screen">
      <div className="max-w-6xl mx-auto px-4">
        <Link href="/digital-art" className="text-gold-500 hover:text-gold-400 text-sm font-medium transition mb-6 inline-block">
          ← Back to Digital Collectibles
        </Link>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* NFT Image */}
          <div className="lg:col-span-1">
            <div className="bg-dark-800 border border-white/10 rounded-xl overflow-hidden sticky top-24">
              <div className="aspect-square bg-dark-700 relative">
                <img
                  src={nft?.image || "/placeholder.png"}
                  alt={nft?.name || "NFT"}
                  className="w-full h-full object-cover"
                  onError={(e) => { (e.target as HTMLImageElement).src = "/placeholder.png"; }}
                />
              </div>
            </div>
          </div>

          {/* Listing Details */}
          <div className="lg:col-span-2 space-y-8">
            {/* NFT Info */}
            <div>
              <p className="text-gray-500 text-sm mb-2">{nft?.collection}</p>
              <h1 className="font-serif text-4xl text-white mb-4">{nft?.name || "Untitled"}</h1>
              <p className="text-gray-600 text-xs font-mono">{mint}</p>
            </div>

            {/* Status Badge */}
            {isSettled ? (
              <div className="bg-green-900/20 border border-green-700 rounded-lg p-4 text-green-400 text-sm font-medium">
                ✓ Auction Settled
              </div>
            ) : isCancelled ? (
              <div className="bg-red-900/20 border border-red-700 rounded-lg p-4 text-red-400 text-sm font-medium">
                ✗ Listing Cancelled
              </div>
            ) : null}

            {/* Auction Countdown (for auctions) */}
            {isAuction && !isSettled && !isCancelled && (
              <div className="bg-dark-800 border border-white/10 rounded-xl p-6">
                <p className="text-gray-400 text-sm mb-4">Time Remaining</p>
                <AuctionCountdownTimer
                  endTime={listing.endTime}
                  onEnded={() => setAuctionEnded(true)}
                />
              </div>
            )}

            {/* Current Bid / Price */}
            <div className="bg-dark-800 border border-white/10 rounded-xl p-6">
              {isFixedPrice ? (
                <div>
                  <p className="text-gray-400 text-sm mb-2">Listed Price</p>
                  <p className="text-4xl font-serif text-gold-400">◎ {(listing.price / 1e9).toFixed(4)}</p>
                </div>
              ) : (
                <div>
                  <p className="text-gray-400 text-sm mb-2">
                    {listing.currentBid > 0 ? "Current Highest Bid" : "Starting Bid"}
                  </p>
                  <p className="text-4xl font-serif text-gold-400">◎ {(Math.max(listing.price, listing.currentBid) / 1e9).toFixed(4)}</p>
                  {listing.currentBid > 0 && (
                    <p className="text-gray-500 text-xs mt-2">
                      Leading bidder: {listing.highestBidder.slice(0, 4)}...{listing.highestBidder.slice(-4)}
                    </p>
                  )}
                </div>
              )}
            </div>

            {/* Bidding Section (for auctions) */}
            {isAuction && !isSettled && !isCancelled && !auctionEnded && !isSeller && (
              <div className="bg-dark-800 border border-white/10 rounded-xl p-6 space-y-4">
                <p className="text-gold-400 text-sm font-medium uppercase tracking-wider">Place Your Bid</p>
                <div className="space-y-3">
                  <div>
                    <label className="text-gray-400 text-xs mb-2 block">Bid Amount (SOL)</label>
                    <div className="flex items-center gap-2">
                      <span className="text-white text-lg">◎</span>
                      <input
                        type="number"
                        step="0.1"
                        min={listing.currentBid > 0 ? (listing.currentBid + 0.1 * 1e9) / 1e9 : listing.price / 1e9}
                        value={bidAmount}
                        onChange={(e) => setBidAmount(e.target.value)}
                        className="flex-1 bg-dark-900 border border-white/10 rounded-lg px-4 py-2.5 text-white text-sm focus:outline-none focus:border-gold-500 transition"
                        placeholder="0.00"
                      />
                    </div>
                    <p className="text-gray-500 text-xs mt-1">
                      Minimum: ◎ {listing.currentBid > 0 ? ((listing.currentBid + 0.1 * 1e9) / 1e9).toFixed(2) : (listing.price / 1e9).toFixed(2)}
                    </p>
                  </div>

                  {bidAmount && (
                    <div className="bg-dark-900 border border-white/10 rounded-lg p-3 space-y-2 text-xs">
                      <div className="flex justify-between">
                        <span className="text-gray-400">Your Bid:</span>
                        <span className="text-gold-400 font-semibold">◎ {bidAmount}</span>
                      </div>
                    </div>
                  )}

                  <button
                    onClick={handlePlaceBid}
                    disabled={!connected || !bidAmount || loadingAction}
                    className={`w-full py-3 rounded-lg font-semibold text-sm transition ${
                      !connected || !bidAmount || loadingAction
                        ? "bg-gray-700 text-gray-400 cursor-not-allowed"
                        : "bg-gold-500 hover:bg-gold-600 text-dark-900"
                    }`}
                  >
                    {loadingAction ? "Placing Bid..." : !connected ? "Connect Wallet" : "Place Bid"}
                  </button>
                </div>
              </div>
            )}

            {/* Buy Now Button (for fixed price) */}
            {isFixedPrice && !isSettled && !isCancelled && (
              <button
                onClick={handleBuyNow}
                disabled={!connected || loadingAction}
                className={`w-full py-4 rounded-lg font-semibold text-lg transition ${
                  !connected || loadingAction
                    ? "bg-gray-700 text-gray-400 cursor-not-allowed"
                    : "bg-gold-500 hover:bg-gold-600 text-dark-900"
                }`}
              >
                {loadingAction ? "Processing..." : !connected ? "Connect Wallet to Buy" : "Buy Now"}
              </button>
            )}

            {/* Settle Auction Button (for ended auctions) */}
            {isAuction && auctionEnded && !isSettled && !isCancelled && listing.currentBid > 0 && (
              <button
                onClick={handleSettleAuction}
                disabled={loadingAction}
                className={`w-full py-4 rounded-lg font-semibold text-lg transition ${
                  loadingAction
                    ? "bg-gray-700 text-gray-400 cursor-not-allowed"
                    : "bg-purple-600 hover:bg-purple-700 text-white"
                }`}
              >
                {loadingAction ? "Settling..." : "Settle Auction"}
              </button>
            )}

            {/* Ended auction with no bids — prompt seller to reclaim */}
            {isAuction && auctionEnded && !isSettled && !isCancelled && listing.currentBid === 0 && isSeller && (
              <div className="bg-yellow-900/30 border border-yellow-700/50 rounded-xl p-5 text-center">
                <p className="text-yellow-200 font-semibold mb-1">Auction ended with no bids</p>
                <p className="text-yellow-200/70 text-sm">Cancel the listing to reclaim your NFT from escrow.</p>
              </div>
            )}

            {/* Cancel Listing Button (seller only) — hidden during live auction with bids */}
            {isSeller && !isSettled && !isCancelled && !(isAuction && !auctionEnded && listing.currentBid > 0) && (
              <div className="pt-4 border-t border-white/10">
                <p className="text-gray-500 text-xs mb-3">
                  {isAuction && listing.currentBid > 0
                    ? "Cannot cancel after bids have been placed"
                    : isAuction && auctionEnded
                    ? "Cancel to return NFT to your wallet"
                    : "You can cancel this listing anytime"}
                </p>
                <button
                  onClick={handleCancelListing}
                  disabled={isAuction && listing.currentBid > 0 || loadingAction}
                  className={`w-full py-2 rounded-lg font-semibold text-sm transition ${
                    isAuction && listing.currentBid > 0 || loadingAction
                      ? "bg-gray-700 text-gray-400 cursor-not-allowed"
                      : "bg-red-900 hover:bg-red-800 text-red-100"
                  }`}
                >
                  {loadingAction ? "Cancelling..." : "Cancel Listing"}
                </button>
              </div>
            )}

            {/* Bid History */}
            {isAuction && (
              <div>
                <h2 className="font-serif text-2xl text-white mb-4">Bid History</h2>
                <BidHistory 
                  nftMint={mint} 
                  connection={connection}
                  currentBid={listing?.currentBid}
                  highestBidder={listing?.highestBidder}
                />
              </div>
            )}

            {/* Seller Info */}
            <div className="bg-dark-800 border border-white/10 rounded-xl p-6">
              <p className="text-gray-400 text-sm mb-2">Seller</p>
              <p className="text-white font-mono text-sm">{listing.seller.slice(0, 4)}..{listing.seller.slice(-4)}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
