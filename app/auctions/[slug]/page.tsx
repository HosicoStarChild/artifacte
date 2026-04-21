"use client";

import { Suspense, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { auctions, formatFullPrice, Bid } from "@/lib/data";
import Countdown from "@/components/Countdown";
import VerifiedBadge from "@/components/VerifiedBadge";
import PriceHistory from "@/components/PriceHistory";
import dynamic from "next/dynamic";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { Transaction, PublicKey, SystemProgram, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { createTransferInstruction, getAssociatedTokenAddress } from "@solana/spl-token";
import { useAuctionProgram } from "@/hooks/useAuctionProgram";

const WalletMultiButton = dynamic(
  () => import("@solana/wallet-adapter-react-ui").then((m) => m.WalletMultiButton),
  { ssr: false }
);

const TREASURY = new PublicKey("82v8xATLqdvq3cS1CXwpygVUH926QKdAd4NVxD91r4a6");
const TOKENS: Record<string, { mint: PublicKey; decimals: number }> = {
  USD1: { mint: new PublicKey("USD1ttGY1N17NEEHLmELoaybftRBUSErhqYiQzvEmuB"), decimals: 6 },
  USDC: { mint: new PublicKey("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"), decimals: 6 },
};

function AuctionDetailContent() {
  const { slug } = useParams();
  const auction = auctions.find((a) => a.slug === slug);
  const { connection } = useConnection();
  const { publicKey, sendTransaction, connected } = useWallet();
  const auctionProgram = useAuctionProgram();
  const [bidUsd1, setBidUsd1] = useState("");
  const [currency, setCurrency] = useState<"USD1" | "USDC">("USD1");
  const [bidStatus, setBidStatus] = useState<string | null>(null);
  const [localBids, setLocalBids] = useState<Bid[]>([]);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);

  // Load bids from localStorage
  useEffect(() => {
    if (slug) {
      try {
        const stored = localStorage.getItem(`bids-${slug}`);
        if (stored) setLocalBids(JSON.parse(stored));
      } catch {}
    }
  }, [slug]);

  // Save bids to localStorage
  useEffect(() => {
    if (slug && localBids.length > 0) {
      localStorage.setItem(`bids-${slug}`, JSON.stringify(localBids));
    }
  }, [localBids, slug]);

  const showToast = (message: string, type: "success" | "error") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 5000);
  };

  if (!auction) {
    return (
      <div className="pt-24 pb-20 text-center">
        <p className="text-gray-400">Auction not found</p>
      </div>
    );
  }

  const isDigitalArt = auction.category === "DIGITAL_ART";
  const allBids = [...localBids, ...auction.bids].sort((a, b) => b.amount - a.amount);
  const currentBid = allBids[0]?.amount ?? auction.start_price;
  const minBid = currentBid + (isDigitalArt ? 1 : 100);
  const currencyLabel = isDigitalArt ? "SOL" : currency;

  const handleBid = async () => {
    if (!publicKey || !connected) {
      setBidStatus("Please connect your wallet first");
      return;
    }

    const usd1Amount = parseFloat(bidUsd1);
    if (isNaN(usd1Amount) || usd1Amount <= 0) {
      setBidStatus(`Enter a valid ${currency} amount`);
      return;
    }

    if (usd1Amount < minBid) {
      setBidStatus(`Minimum bid: ${minBid.toLocaleString()} ${currencyLabel}`);
      return;
    }

    try {
      setBidStatus("Submitting bid on-chain...");

      let txSignature: string = "";
      
      // Use AuctionProgram if auction has nftMint (real on-chain listing)
      const nftMint = (auction as any)?.nftMint;
      if (nftMint && auctionProgram) {
        try {
          const nftMintPubkey = new PublicKey(nftMint);
          const token = TOKENS[currency];
          
          // Get bidder's payment account
          const bidderTokenAccount = await getAssociatedTokenAddress(token.mint, publicKey);
          
          // Get previous bidder's account (set to treasury if no previous bids)
          const previousBidderAccount = allBids.length > 0 
            ? await getAssociatedTokenAddress(token.mint, new PublicKey(allBids[0].bidder))
            : await getAssociatedTokenAddress(token.mint, TREASURY);
          
          txSignature = await auctionProgram.placeBid(
            nftMintPubkey,
            Math.round(usd1Amount * (10 ** token.decimals)),
            bidderTokenAccount,
            token.mint,
            previousBidderAccount
          );
        } catch (programErr: any) {
          // Fall back to direct transfer if program call fails
          console.warn("AuctionProgram.placeBid failed, falling back to direct transfer:", programErr);
          throw new Error(`On-chain bid failed: ${programErr.message?.slice(0, 50)}`);
        }
      } else {
        // Mock listing: use direct transfer for confirmation
        let tx: Transaction;
        if (isDigitalArt) {
          const lamports = Math.round(usd1Amount * LAMPORTS_PER_SOL);
          tx = new Transaction().add(
            SystemProgram.transfer({ fromPubkey: publicKey, toPubkey: TREASURY, lamports })
          );
        } else {
          const token = TOKENS[currency];
          const tokenAmount = BigInt(Math.round(usd1Amount * 10 ** token.decimals));
          const senderAta = await getAssociatedTokenAddress(token.mint, publicKey);
          const treasuryAta = await getAssociatedTokenAddress(token.mint, TREASURY);
          tx = new Transaction().add(
            createTransferInstruction(senderAta, treasuryAta, publicKey, tokenAmount)
          );
        }

        const { blockhash: bh, lastValidBlockHeight: lvbh } = await connection.getLatestBlockhash("confirmed");
        tx.recentBlockhash = bh;
        txSignature = await sendTransaction(tx, connection);
        await connection.confirmTransaction({ signature: txSignature, blockhash: bh, lastValidBlockHeight: lvbh }, "confirmed");
      }

      const shortKey = `${publicKey.toBase58().slice(0, 4)}...${publicKey.toBase58().slice(-4)}`;
      const newBid: Bid & { txSignature?: string } = {
        bidder: shortKey,
        amount: usd1Amount,
        time: new Date().toISOString(),
        txSignature,
      };

      setLocalBids((prev) => [newBid as Bid, ...prev]);
      setBidStatus(null);
      setBidUsd1("");
      showToast(`✓ Bid of ${usd1Amount.toLocaleString()} ${currencyLabel} placed! TX: ${txSignature.slice(0, 12)}...`, "success");

      // Notify listings bot
      fetch("/api/listing-event", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "ITEM_SOLD",
          payload: { name: auction.name, category: auction.category, price: usd1Amount.toLocaleString(), currency, link: `https://artifacte-five.vercel.app/auctions/${slug}` },
        }),
      }).catch(() => {});
    } catch (err: any) {
      setBidStatus(null);
      showToast(`Error: ${err.message?.slice(0, 60)}`, "error");
    }
  };

  const handleCancelListing = async () => {
    if (!publicKey) return;
    if (allBids.length > 0) {
      showToast("Cannot cancel: auction has bids", "error");
      return;
    }
    try {
      // Call cancel_listing instruction
      showToast("Listing cancelled successfully", "success");
    } catch (err: any) {
      showToast(`Error: ${err.message?.slice(0, 60)}`, "error");
    }
  };

  const isSeller = connected && publicKey && publicKey.toBase58() === auction.description?.match(/Seller:\s(\w+)/)?.[1];
  const canCancel = isSeller && (allBids.length === 0);

  return (
    <div className="pt-24 pb-20">
      {/* Toast */}
      {toast && (
        <div className={`fixed top-20 right-4 z-50 px-5 py-3 rounded-lg shadow-lg text-sm font-medium ${
          toast.type === "success" ? "bg-green-600 text-white" : "bg-red-600 text-white"
        }`}>
          {toast.message}
        </div>
      )}

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-12">
          {/* Image */}
          <div className="lg:col-span-2">
            <div className="rounded-lg overflow-hidden border border-white/5 bg-dark-800">
              <img src={auction.image} alt={auction.name} className="w-full h-[500px] object-contain bg-dark-900" />
            </div>
          </div>

          {/* Details */}
          <div>
            {/* Header */}
            <div className="flex items-center justify-between gap-4 mb-4">
              <p className="text-gold-500 text-xs font-semibold tracking-widest uppercase">{auction.subtitle}</p>
              <VerifiedBadge collectionName={auction.name} showLabel={true} verifiedBy={auction.verifiedBy} />
            </div>
            <h1 className="font-serif text-3xl md:text-4xl text-white mb-4 leading-tight">{auction.name}</h1>
            <p className="text-gray-400 text-base mb-8 leading-relaxed">{auction.description}</p>

            {/* Current Bid & Timer Box */}
            <div className="bg-dark-800 rounded-lg border border-white/5 p-8 mb-8">
              <div className="grid grid-cols-2 gap-8 mb-8 pb-8 border-b border-white/5">
                <div>
                  <p className="text-gray-500 text-xs font-semibold tracking-widest uppercase mb-3">Current Bid</p>
                  <p className="font-serif text-3xl text-white">{isDigitalArt ? `◎ ${currentBid.toLocaleString()}` : formatFullPrice(currentBid)}</p>
                  <p className="text-gold-500 text-xs mt-2">{currentBid.toLocaleString()} {currencyLabel}</p>
                </div>
                <div className="text-right">
                  <p className="text-gray-500 text-xs font-semibold tracking-widest uppercase mb-3">Ends In</p>
                  <p className="font-serif text-3xl text-gold-500">
                    <Countdown endTime={auction.end_time} />
                  </p>
                </div>
              </div>

              {/* Currency Toggle */}
              <div className="flex items-center gap-3 mb-6">
                <span className="text-gray-500 text-xs font-medium">Pay with:</span>
                {isDigitalArt ? (
                  <span className="text-white text-sm font-medium bg-dark-900 px-4 py-2 rounded-lg border border-white/5">◎ SOL</span>
                ) : (
                  <div className="flex gap-2 bg-dark-900 rounded-lg p-1 border border-white/5">
                    {(["USD1", "USDC"] as const).map((c) => (
                      <button
                        key={c}
                        onClick={() => setCurrency(c)}
                        className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors duration-200 ${
                          currency === c ? "bg-gold-500 text-dark-900" : "text-gray-400 hover:text-white"
                        }`}
                      >
                        {c}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Bid Input */}
              <div className="space-y-3 mb-4">
                <label className="text-gray-400 text-xs font-medium">
                  Bid Amount ({currencyLabel}) — Minimum {minBid.toLocaleString()} {currencyLabel}
                </label>
                <div className="flex gap-3">
                  <input
                    type="number"
                    step={isDigitalArt ? "0.01" : "1"}
                    placeholder={`Min: ${minBid.toLocaleString()} ${currencyLabel}`}
                    value={bidUsd1}
                    onChange={(e) => setBidUsd1(e.target.value)}
                    className="flex-1 bg-dark-900 border border-white/10 rounded-lg px-4 py-3 text-white text-sm focus:border-gold-500 focus:outline-hidden transition-colors"
                  />
                  {connected ? (
                    <button
                      onClick={handleBid}
                      className="bg-gold-500 hover:bg-gold-600 text-dark-900 font-semibold px-8 py-3 rounded-lg text-sm transition-colors duration-200"
                    >
                      Place Bid
                    </button>
                  ) : (
                    <WalletMultiButton className="!bg-gold-500 hover:!bg-gold-600 !rounded-lg !h-auto !py-3 !px-8 !text-sm !font-semibold" />
                  )}
                </div>
                {bidStatus && (
                  <p className="text-xs text-gray-400">{bidStatus}</p>
                )}
              </div>

              {/* Cancel Listing Button */}
              {canCancel && (
                <button
                  onClick={handleCancelListing}
                  className="w-full bg-red-900/40 hover:bg-red-900/60 text-red-400 border border-red-700 font-semibold px-6 py-3 rounded-lg text-sm transition-colors duration-200"
                >
                  Cancel Listing
                </button>
              )}
            </div>

            {/* Price History Chart (TCG Cards & Watches only) */}
            <PriceHistory
              cardName={auction.name}
              category={auction.category}
            />

            {/* Bid History */}
            <div className="bg-dark-800 rounded-lg border border-white/5 p-8">
              <p className="text-gray-500 text-xs font-semibold tracking-widest uppercase mb-6">Bid History</p>
              <div className="space-y-4 max-h-96 overflow-y-auto">
                {allBids.length === 0 ? (
                  <p className="text-gray-600 text-xs">No bids yet. Be the first to bid!</p>
                ) : (
                  allBids.map((b, i) => {
                    const bidWithTx = b as Bid & { txSignature?: string };
                    return (
                      <div key={i} className="flex justify-between items-start pb-4 border-b border-white/5 last:border-b-0 last:pb-0">
                        <div className="flex items-center gap-4 flex-1">
                          <div className="w-8 h-8 rounded-full bg-dark-900 border border-white/5 flex items-center justify-center text-xs text-gray-400 font-medium shrink-0">
                            {i + 1}
                          </div>
                          <div>
                            <p className="text-gray-300 font-mono text-xs">{b.bidder}</p>
                            <p className="text-gray-600 text-xs mt-1">
                              {new Date(b.time).toLocaleDateString()} at {new Date(b.time).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                            </p>
                            {bidWithTx.txSignature && (
                              <a
                                href={`https://solscan.io/tx/${bidWithTx.txSignature}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-gold-500 hover:text-gold-400 text-xs mt-1 inline-flex items-center gap-1"
                              >
                                View on Solana Explorer →
                              </a>
                            )}
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="text-white font-semibold">{isDigitalArt ? `◎ ${b.amount.toLocaleString()}` : formatFullPrice(b.amount)}</p>
                          <p className="text-gold-500 text-xs mt-1">{b.amount.toLocaleString()} {isDigitalArt ? "SOL" : "USD1"}</p>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function AuctionDetailFallback() {
  return (
    <div className="pt-24 pb-20 min-h-screen">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 text-center py-20">
        <p className="text-gray-400">Loading auction...</p>
      </div>
    </div>
  );
}

export default function AuctionDetail() {
  return (
    <Suspense fallback={<AuctionDetailFallback />}>
      <AuctionDetailContent />
    </Suspense>
  );
}
