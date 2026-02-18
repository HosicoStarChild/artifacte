"use client";

import { useParams } from "next/navigation";
import { auctions, formatFullPrice, Bid } from "@/lib/data";
import Countdown from "@/components/Countdown";
import { useState, useEffect } from "react";
import dynamic from "next/dynamic";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { Transaction, PublicKey } from "@solana/web3.js";
import { createTransferInstruction, getAssociatedTokenAddress } from "@solana/spl-token";

const WalletMultiButton = dynamic(
  () => import("@solana/wallet-adapter-react-ui").then((m) => m.WalletMultiButton),
  { ssr: false }
);

const TREASURY = new PublicKey("DDSpvAK8DbuAdEaaBHkfLieLPSJVCWWgquFAA3pvxXoX");
const TOKENS: Record<string, { mint: PublicKey; decimals: number }> = {
  USD1: { mint: new PublicKey("USD1ttGY1N17NEEHLmELoaybftRBUSErhqYiQzvEmuB"), decimals: 6 },
  USDC: { mint: new PublicKey("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"), decimals: 6 },
};

export default function AuctionDetail() {
  const { slug } = useParams();
  const auction = auctions.find((a) => a.slug === slug);
  const { connection } = useConnection();
  const { publicKey, sendTransaction, connected } = useWallet();
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

  const allBids = [...localBids, ...auction.bids].sort((a, b) => b.amount - a.amount);
  const currentBid = allBids[0]?.amount ?? auction.start_price;
  const minBid = currentBid + 100;

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
      setBidStatus(`Minimum bid: ${formatFullPrice(minBid)} ${currency}`);
      return;
    }

    try {
      setBidStatus("Submitting bid on-chain...");

      const token = TOKENS[currency];
      const tokenAmount = BigInt(Math.round(usd1Amount * 10 ** token.decimals));
      const senderAta = await getAssociatedTokenAddress(token.mint, publicKey);
      const treasuryAta = await getAssociatedTokenAddress(token.mint, TREASURY);

      const tx = new Transaction().add(
        createTransferInstruction(
          senderAta,
          treasuryAta,
          publicKey,
          tokenAmount,
        )
      );

      const sig = await sendTransaction(tx, connection);
      await connection.confirmTransaction(sig, "confirmed");

      const shortKey = `${publicKey.toBase58().slice(0, 4)}...${publicKey.toBase58().slice(-4)}`;
      const newBid: Bid = {
        bidder: shortKey,
        amount: usd1Amount,
        time: new Date().toISOString(),
      };

      setLocalBids((prev) => [newBid, ...prev]);
      setBidStatus(null);
      setBidUsd1("");
      showToast(`✓ Bid of ${usd1Amount.toLocaleString()} USD1 placed! TX: ${sig.slice(0, 12)}...`, "success");

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

      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-10">
          {/* Image */}
          <div>
            <div className="rounded-2xl overflow-hidden border border-white/5">
              <img src={auction.image} alt={auction.name} className="w-full h-[400px] object-cover" />
            </div>
          </div>

          {/* Details */}
          <div>
            <p className="text-gold-400 text-xs font-bold tracking-[0.2em] uppercase mb-2">{auction.subtitle}</p>
            <h1 className="font-serif text-3xl text-white mb-4">{auction.name}</h1>
            <p className="text-gray-400 text-sm mb-6 leading-relaxed">{auction.description}</p>

            {/* Timer */}
            <div className="bg-navy-800 rounded-xl border border-white/5 p-5 mb-6">
              <div className="flex justify-between items-center mb-4">
                <div>
                  <p className="text-gray-500 text-[10px] uppercase tracking-wider">Current Bid</p>
                  <p className="text-white font-serif text-3xl">{formatFullPrice(currentBid)}</p>
                  <p className="text-gold-400 text-xs">{currentBid.toLocaleString()} {currency}</p>
                </div>
                <div className="text-right">
                  <p className="text-gray-500 text-[10px] uppercase tracking-wider">Ends In</p>
                  <p className="text-gold-400 text-xl">
                    <Countdown endTime={auction.end_time} />
                  </p>
                </div>
              </div>

              {/* Currency Toggle */}
              <div className="flex items-center gap-3 mb-3">
                <span className="text-gray-500 text-xs">Pay with:</span>
                <div className="flex gap-1 bg-navy-900 rounded-lg p-0.5">
                  {(["USD1", "USDC"] as const).map((c) => (
                    <button
                      key={c}
                      onClick={() => setCurrency(c)}
                      className={`px-3 py-1 rounded-md text-xs font-medium transition ${
                        currency === c ? "bg-gold-500 text-navy-900" : "text-gray-400 hover:text-white"
                      }`}
                    >
                      {c}
                    </button>
                  ))}
                </div>
              </div>

              {/* Bid Input */}
              <div className="mb-2">
                <label className="text-gray-400 text-xs mb-1 block">
                  Bid Amount ({currency}) — min {formatFullPrice(minBid)} {currency}
                </label>
              </div>
              <div className="flex gap-3">
                <div className="flex-1 relative">
                  <input
                    type="number"
                    step="1"
                    placeholder={`Min: ${minBid.toLocaleString()} ${currency}`}
                    value={bidUsd1}
                    onChange={(e) => setBidUsd1(e.target.value)}
                    className="w-full bg-navy-900 border border-white/10 rounded-lg px-4 py-3 text-white text-sm focus:border-gold-500 focus:outline-none"
                  />
                </div>
                {connected ? (
                  <button
                    onClick={handleBid}
                    className="bg-gold-500 hover:bg-gold-600 text-navy-900 font-semibold px-6 py-3 rounded-lg text-sm transition"
                  >
                    Place Bid
                  </button>
                ) : (
                  <WalletMultiButton className="!bg-gold-500 hover:!bg-gold-600 !rounded-lg !h-auto !py-3 !text-sm !font-semibold" />
                )}
              </div>

              {bidStatus && (
                <p className="mt-3 text-xs text-gray-400">{bidStatus}</p>
              )}
            </div>

            {/* Price Chart */}
            <div className="bg-navy-800 rounded-xl border border-white/5 p-5 mb-6">
              <p className="text-gray-500 text-[10px] uppercase tracking-wider mb-3">Bid History Chart</p>
              <div className="h-32 flex items-end gap-1">
                {allBids
                  .slice(0, 10)
                  .reverse()
                  .map((b, i) => {
                    const maxBid = Math.max(...allBids.map((x) => x.amount));
                    const height = (b.amount / maxBid) * 100;
                    return (
                      <div key={i} className="flex-1 flex flex-col items-center gap-1">
                        <div
                          className="w-full bg-gradient-to-t from-gold-500/50 to-gold-400 rounded-t"
                          style={{ height: `${height}%` }}
                        />
                      </div>
                    );
                  })}
              </div>
            </div>

            {/* Bid History */}
            <div className="bg-navy-800 rounded-xl border border-white/5 p-5">
              <p className="text-gray-500 text-[10px] uppercase tracking-wider mb-3">Bid History</p>
              <div className="space-y-3 max-h-60 overflow-y-auto">
                {allBids.map((b, i) => (
                  <div key={i} className="flex justify-between items-center text-sm">
                    <div className="flex items-center gap-3">
                      <div className="w-7 h-7 rounded-full bg-navy-700 flex items-center justify-center text-[10px] text-gray-400">
                        {i + 1}
                      </div>
                      <span className="text-gray-300 font-mono text-xs">{b.bidder}</span>
                    </div>
                    <div className="text-right">
                      <span className="text-white font-medium">{formatFullPrice(b.amount)}</span>
                      <p className="text-gold-400 text-[10px]">{b.amount.toLocaleString()} USD1</p>
                      <p className="text-gray-600 text-[10px]">
                        {new Date(b.time).toLocaleDateString()} {new Date(b.time).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
