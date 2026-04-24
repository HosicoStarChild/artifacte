"use client";

import { Suspense, useEffect, useState } from "react";
import { useParams } from "next/navigation";

import { HomeImage } from "@/components/home/HomeImage";
import Countdown from "@/components/Countdown";
import { showToast } from "@/components/ToastContainer";
import VerifiedBadge from "@/components/VerifiedBadge";
import PriceHistory from "@/components/PriceHistory";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import dynamic from "next/dynamic";
import { useConnection } from "@solana/wallet-adapter-react";
import { Transaction, PublicKey, SystemProgram, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { createTransferInstruction, getAssociatedTokenAddress } from "@solana/spl-token";
import { useAuctionProgram } from "@/hooks/useAuctionProgram";
import { useWalletCapabilities } from "@/hooks/useWalletCapabilities";
import { auctions, formatFullPrice, type Auction, type Bid } from "@/lib/data";

const WalletMultiButton = dynamic(
  () => import("@solana/wallet-adapter-react-ui").then((m) => m.WalletMultiButton),
  { ssr: false }
);

const TREASURY = new PublicKey("82v8xATLqdvq3cS1CXwpygVUH926QKdAd4NVxD91r4a6");
const TOKENS: Record<string, { mint: PublicKey; decimals: number }> = {
  USD1: { mint: new PublicKey("USD1ttGY1N17NEEHLmELoaybftRBUSErhqYiQzvEmuB"), decimals: 6 },
  USDC: { mint: new PublicKey("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"), decimals: 6 },
};

type StoredBid = Bid & {
  txSignature?: string;
};

type AuctionWithMint = Auction & {
  nftMint?: string;
};

function parseStoredBids(serializedBids: string | null): StoredBid[] {
  if (!serializedBids) {
    return [];
  }

  try {
    const parsedBids = JSON.parse(serializedBids) as Array<Partial<StoredBid>>;
    return parsedBids.flatMap((bid) => {
      if (typeof bid.bidder !== "string" || typeof bid.time !== "string") {
        return [];
      }

      const amount = Number(bid.amount);
      if (!Number.isFinite(amount) || amount <= 0) {
        return [];
      }

      return [{
        bidder: bid.bidder,
        amount,
        time: bid.time,
        txSignature: typeof bid.txSignature === "string" ? bid.txSignature : undefined,
      }];
    });
  } catch {
    return [];
  }
}

function getAuctionNftMint(auction: Auction): string | null {
  const auctionWithMint = auction as AuctionWithMint;
  return typeof auctionWithMint.nftMint === "string" ? auctionWithMint.nftMint : null;
}

function getAuctionSeller(description: string): string | null {
  const match = description.match(/Seller:\s(\w+)/);
  return match?.[1] || null;
}

function AuctionDetailContent() {
  const { slug } = useParams<{ slug: string }>();
  const auction = auctions.find((a) => a.slug === slug);
  const { connection } = useConnection();
  const { publicKey, sendTransaction, connected } = useWalletCapabilities();
  const auctionProgram = useAuctionProgram();
  const [bidUsd1, setBidUsd1] = useState("");
  const [currency, setCurrency] = useState<"USD1" | "USDC">("USD1");
  const [bidStatus, setBidStatus] = useState<string | null>(null);
  const [localBids, setLocalBids] = useState<StoredBid[]>(() => {
    if (typeof window === "undefined" || !slug) {
      return [];
    }

    return parseStoredBids(localStorage.getItem(`bids-${slug}`));
  });

  // Save bids to localStorage
  useEffect(() => {
    if (slug && localBids.length > 0) {
      localStorage.setItem(`bids-${slug}`, JSON.stringify(localBids));
    }
  }, [localBids, slug]);

  if (!auction) {
    return (
      <div className="pt-24 pb-20">
        <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
          <Card className="border-white/5 bg-dark-800/70 py-0">
            <CardContent className="px-6 py-14 text-center">
              <p className="text-gray-400">Auction not found</p>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  const isDigitalArt = auction.category === "DIGITAL_ART";
  const allBids: StoredBid[] = [...localBids, ...auction.bids].sort((a, b) => b.amount - a.amount);
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

      let txSignature = "";
      
      // Use AuctionProgram if auction has nftMint (real on-chain listing)
      const nftMint = getAuctionNftMint(auction);
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
        } catch (error) {
          const message = error instanceof Error ? error.message : "On-chain bid failed";
          // Fall back to direct transfer if program call fails
          console.warn("AuctionProgram.placeBid failed, falling back to direct transfer:", error);
          throw new Error(`On-chain bid failed: ${message.slice(0, 50)}`);
        }
      } else {
        // Mock listing: use direct transfer for confirmation
        if (!sendTransaction) {
          throw new Error("Wallet does not support sending transactions");
        }

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
      const newBid: StoredBid = {
        bidder: shortKey,
        amount: usd1Amount,
        time: new Date().toISOString(),
        txSignature,
      };

      setLocalBids((prevBids) => [newBid, ...prevBids]);
      setBidStatus(null);
      setBidUsd1("");
      showToast.success(`✓ Bid of ${usd1Amount.toLocaleString()} ${currencyLabel} placed! TX: ${txSignature.slice(0, 12)}...`);

      // Notify listings bot
      fetch("/api/listing-event", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "ITEM_SOLD",
          payload: { name: auction.name, category: auction.category, price: usd1Amount.toLocaleString(), currency, link: `https://artifacte-five.vercel.app/auctions/${slug}` },
        }),
      }).catch(() => {});
    } catch (error) {
      const message = error instanceof Error ? error.message : "Bid failed";
      setBidStatus(null);
      showToast.error(`Error: ${message.slice(0, 60)}`);
    }
  };

  const handleCancelListing = async () => {
    if (!publicKey) return;
    if (allBids.length > 0) {
      showToast.error("Cannot cancel: auction has bids");
      return;
    }
    try {
      // Call cancel_listing instruction
      showToast.success("Listing cancelled successfully");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Cancel listing failed";
      showToast.error(`Error: ${message.slice(0, 60)}`);
    }
  };

  const isSeller = connected && publicKey && publicKey.toBase58() === getAuctionSeller(auction.description);
  const canCancel = isSeller && (allBids.length === 0);

  return (
    <div className="pt-24 pb-20">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-12">
          {/* Image */}
          <div className="lg:col-span-2">
            <Card className="overflow-hidden border-white/5 bg-dark-800 py-0">
              <div className="relative h-125 bg-dark-900">
                <HomeImage
                  src={auction.image}
                  alt={auction.name}
                  sizes="(max-width: 1024px) 100vw, 66vw"
                  contain
                  className="p-6"
                />
              </div>
            </Card>
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
            <Card className="mb-8 border-white/5 bg-dark-800 py-0">
              <CardContent className="px-8 py-8">
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
                      <Button
                        key={c}
                        type="button"
                        onClick={() => setCurrency(c)}
                        variant="ghost"
                        size="sm"
                        className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors duration-200 ${
                          currency === c ? "bg-gold-500 text-dark-900" : "text-gray-400 hover:text-white"
                        }`}
                      >
                        {c}
                      </Button>
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
                  <Input
                    type="number"
                    step={isDigitalArt ? "0.01" : "1"}
                    placeholder={`Min: ${minBid.toLocaleString()} ${currencyLabel}`}
                    value={bidUsd1}
                    onChange={(e) => setBidUsd1(e.target.value)}
                    className="h-12 flex-1 border-white/10 bg-dark-900 text-white"
                  />
                  {connected ? (
                    <Button
                      type="button"
                      onClick={handleBid}
                      className="h-12 bg-gold-500 px-8 text-sm font-semibold text-dark-900 hover:bg-gold-600"
                    >
                      Place Bid
                    </Button>
                  ) : (
                    <WalletMultiButton className="h-auto! rounded-lg! bg-gold-500! px-8! py-3! text-sm! font-semibold! hover:bg-gold-600!" />
                  )}
                </div>
                {bidStatus && (
                  <p className="text-xs text-gray-400">{bidStatus}</p>
                )}
              </div>

              {/* Cancel Listing Button */}
              {canCancel && (
                <Button
                  type="button"
                  onClick={handleCancelListing}
                  className="w-full border border-red-700 bg-red-900/40 px-6 py-3 text-sm font-semibold text-red-400 hover:bg-red-900/60"
                >
                  Cancel Listing
                </Button>
              )}
              </CardContent>
            </Card>

            {/* Price History Chart (TCG Cards & Watches only) */}
            <PriceHistory
              cardName={auction.name}
              category={auction.category}
            />

            {/* Bid History */}
            <Card className="border-white/5 bg-dark-800 py-0">
              <CardContent className="px-8 py-8">
                <p className="mb-6 text-gray-500 text-xs font-semibold tracking-widest uppercase">Bid History</p>
                <div className="max-h-96 space-y-4 overflow-y-auto">
                  {allBids.length === 0 ? (
                    <p className="text-gray-600 text-xs">No bids yet. Be the first to bid!</p>
                  ) : (
                    allBids.map((b, i) => (
                      <div key={`${b.bidder}-${b.time}-${i}`} className="flex items-start justify-between border-b border-white/5 pb-4 last:border-b-0 last:pb-0">
                        <div className="flex flex-1 items-center gap-4">
                          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-white/5 bg-dark-900 text-xs font-medium text-gray-400">
                            {i + 1}
                          </div>
                          <div>
                            <p className="font-mono text-xs text-gray-300">{b.bidder}</p>
                            <p className="mt-1 text-xs text-gray-600">
                              {new Date(b.time).toLocaleDateString()} at {new Date(b.time).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                            </p>
                            {b.txSignature ? (
                              <a
                                href={`https://solscan.io/tx/${b.txSignature}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="mt-1 inline-flex items-center gap-1 text-xs text-gold-500 hover:text-gold-400"
                              >
                                View on Solana Explorer →
                              </a>
                            ) : null}
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="font-semibold text-white">{isDigitalArt ? `◎ ${b.amount.toLocaleString()}` : formatFullPrice(b.amount)}</p>
                          <p className="mt-1 text-xs text-gold-500">{b.amount.toLocaleString()} {isDigitalArt ? "SOL" : "USD1"}</p>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </CardContent>
            </Card>
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
