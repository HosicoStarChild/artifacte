"use client";

import { useState } from "react";
import { auctions, listings, formatFullPrice } from "@/lib/data";
import AuctionCard from "@/components/AuctionCard";
import VerifiedBadge from "@/components/VerifiedBadge";
import { useWallet } from "@solana/wallet-adapter-react";
import { useConnection } from "@solana/wallet-adapter-react";
import { PublicKey, Transaction } from "@solana/web3.js";
import { createTransferInstruction, getAssociatedTokenAddress } from "@solana/spl-token";
import dynamic from "next/dynamic";
import Link from "next/link";

const WalletMultiButton = dynamic(
  () => import("@solana/wallet-adapter-react-ui").then((m) => m.WalletMultiButton),
  { ssr: false }
);

const TREASURY = new PublicKey("DDSpvAK8DbuAdEaaBHkfLieLPSJVCWWgquFAA3pvxXoX");
const TOKENS: Record<string, { mint: PublicKey; decimals: number; label: string }> = {
  USD1: { mint: new PublicKey("USD1ttGY1N17NEEHLmELoaybftRBUSErhqYiQzvEmuB"), decimals: 6, label: "USD1" },
  USDC: { mint: new PublicKey("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"), decimals: 6, label: "USDC" },
};

export default function AuctionsPage() {
  const [tab, setTab] = useState<"fixed" | "live">("fixed");
  const { publicKey, sendTransaction, connected } = useWallet();
  const { connection } = useConnection();
  const [buyingId, setBuyingId] = useState<string | null>(null);
  const [currency, setCurrency] = useState<"USD1" | "USDC">("USD1");
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);

  const showToast = (message: string, type: "success" | "error") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 5000);
  };

  const handleBuyNow = async (listingId: string, priceUsd: number) => {
    if (!connected || !publicKey) {
      showToast("Please connect your wallet first", "error");
      return;
    }

    setBuyingId(listingId);
    try {
      const token = TOKENS[currency];
      const tokenAmount = BigInt(Math.round(priceUsd * 10 ** token.decimals));

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

      showToast(`✓ Purchase successful! TX: ${sig.slice(0, 12)}...`, "success");
    } catch (err: any) {
      showToast(`Error: ${err.message?.slice(0, 80) || "Transaction failed"}`, "error");
    } finally {
      setBuyingId(null);
    }
  };

  return (
    <div className="pt-24 pb-20">
      {/* Toast */}
      {toast && (
        <div className={`fixed top-24 right-4 z-50 px-6 py-3 rounded-lg shadow-lg text-sm font-medium transition-all ${
          toast.type === "success" ? "bg-green-600 text-white" : "bg-red-600 text-white"
        }`}>
          {toast.message}
        </div>
      )}

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mb-12">
          <p className="text-gold-500 text-xs font-semibold tracking-widest uppercase mb-3">Marketplace</p>
          <h1 className="font-serif text-4xl md:text-5xl text-white mb-3">Auctions</h1>
          <p className="text-gray-400 text-base max-w-2xl">
            Discover authenticated real-world assets tokenized on Solana. Bid on live auctions or purchase items at fixed prices.
          </p>
        </div>

        {/* Tabs & Filters */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6 mb-10 pb-8 border-b border-white/5">
          {/* Tabs */}
          <div className="flex gap-3 bg-dark-800 rounded-lg p-1 border border-white/5">
            <button
              onClick={() => setTab("fixed")}
              className={`px-6 py-2.5 rounded-md text-sm font-medium transition-colors duration-200 ${
                tab === "fixed"
                  ? "bg-gold-500 text-dark-900"
                  : "text-gray-400 hover:text-white"
              }`}
            >
              Fixed Price
            </button>
            <button
              onClick={() => setTab("live")}
              className={`px-6 py-2.5 rounded-md text-sm font-medium transition-colors duration-200 ${
                tab === "live"
                  ? "bg-gold-500 text-dark-900"
                  : "text-gray-400 hover:text-white"
              }`}
            >
              Live Auctions
            </button>
          </div>

          {/* Currency Selector */}
          <div className="flex items-center gap-3">
            <span className="text-gray-500 text-xs font-medium tracking-wider">Pay with:</span>
            <div className="flex gap-2 bg-dark-800 rounded-lg p-1 border border-white/5">
              {(["USD1", "USDC"] as const).map((c) => (
                <button
                  key={c}
                  onClick={() => setCurrency(c)}
                  className={`px-4 py-2 rounded-md text-xs font-medium transition-colors duration-200 ${
                    currency === c ? "bg-gold-500 text-dark-900" : "text-gray-400 hover:text-white"
                  }`}
                >
                  {c}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Fixed Price Tab */}
        {tab === "fixed" && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8">
            {listings.map((l) => {
              const usd1Amount = l.price.toLocaleString();
              return (
                <div key={l.id} className="bg-dark-800 rounded-lg border border-white/5 overflow-hidden card-hover group flex flex-col h-full">
                  {/* Image */}
                  <div className="aspect-square overflow-hidden bg-dark-900">
                    <img
                      src={l.image}
                      alt={l.name}
                      className="w-full h-full object-cover group-hover:scale-105 transition duration-500"
                    />
                  </div>
                  {/* Details */}
                  <div className="p-6 flex-1 flex flex-col justify-between">
                    <div>
                      <div className="flex items-center justify-between gap-2 mb-3">
                        <span className="text-xs font-semibold tracking-widest text-gold-500 uppercase">Fixed Price</span>
                        <VerifiedBadge collectionName={l.name} verifiedBy={l.verifiedBy} />
                      </div>
                      <h3 className="text-white font-medium text-base mb-1">{l.name}</h3>
                      <p className="text-gray-500 text-xs mb-1">{l.subtitle}{l.verifiedBy ? ` • ${l.verifiedBy} Verified` : ""}</p>
                      <p className="text-gray-600 text-xs mb-4">{l.category?.replace(/_/g, " ")}</p>
                    </div>
                    <div className="space-y-4">
                      <div>
                        <p className="text-gray-500 text-xs font-medium tracking-wider mb-1">Price</p>
                        <p className="text-white font-serif text-2xl">{formatFullPrice(l.price)}</p>
                        <p className="text-gold-500 text-xs mt-1">{usd1Amount} {currency}</p>
                      </div>
                      {connected ? (
                        <button
                          onClick={() => handleBuyNow(l.id, l.price)}
                          disabled={buyingId === l.id}
                          className="w-full px-4 py-2.5 bg-gold-500 hover:bg-gold-600 disabled:opacity-50 text-dark-900 rounded-lg text-sm font-semibold transition-colors duration-200"
                        >
                          {buyingId === l.id ? "Processing..." : "Buy Now"}
                        </button>
                      ) : (
                        <WalletMultiButton className="!w-full !bg-gold-500 hover:!bg-gold-600 !rounded-lg !h-10 !text-sm !font-semibold" />
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Live Auctions Tab */}
        {tab === "live" && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-8">
            {auctions.map((a) => (
              <AuctionCard key={a.id} auction={a} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
