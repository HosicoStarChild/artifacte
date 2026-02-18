"use client";

import { useState } from "react";
import { auctions, listings, formatFullPrice } from "@/lib/data";
import AuctionCard from "@/components/AuctionCard";
import { useWallet } from "@solana/wallet-adapter-react";
import { useConnection } from "@solana/wallet-adapter-react";
import { PublicKey, Transaction } from "@solana/web3.js";
import { createTransferInstruction, getAssociatedTokenAddress } from "@solana/spl-token";
import dynamic from "next/dynamic";

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
        <div className={`fixed top-20 right-4 z-50 px-5 py-3 rounded-lg shadow-lg text-sm font-medium transition-all ${
          toast.type === "success" ? "bg-green-600 text-white" : "bg-red-600 text-white"
        }`}>
          {toast.message}
        </div>
      )}

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <p className="text-gold-400 text-xs font-bold tracking-[0.2em] uppercase mb-2">Marketplace</p>
        <h1 className="font-serif text-4xl text-white mb-2">Auctions</h1>
        <p className="text-gray-400 text-sm mb-8">Buy or bid on authenticated real-world assets tokenized on Solana</p>

        {/* Tabs */}
        <div className="flex gap-1 mb-10 bg-navy-800 rounded-lg p-1 w-fit">
          <button
            onClick={() => setTab("fixed")}
            className={`px-5 py-2.5 rounded-md text-sm font-medium transition ${
              tab === "fixed"
                ? "bg-gold-500 text-navy-900"
                : "text-gray-400 hover:text-white"
            }`}
          >
            Fixed Price
          </button>
          <button
            onClick={() => setTab("live")}
            className={`px-5 py-2.5 rounded-md text-sm font-medium transition ${
              tab === "live"
                ? "bg-gold-500 text-navy-900"
                : "text-gray-400 hover:text-white"
            }`}
          >
            Live Auctions
          </button>
        </div>

        {/* Currency Selector */}
        <div className="flex items-center gap-3 mb-6">
          <span className="text-gray-500 text-xs uppercase tracking-wider">Pay with:</span>
          <div className="flex gap-1 bg-navy-800 rounded-lg p-1">
            {(["USD1", "USDC"] as const).map((c) => (
              <button
                key={c}
                onClick={() => setCurrency(c)}
                className={`px-4 py-1.5 rounded-md text-xs font-medium transition ${
                  currency === c ? "bg-gold-500 text-navy-900" : "text-gray-400 hover:text-white"
                }`}
              >
                {c}
              </button>
            ))}
          </div>
        </div>

        {/* Fixed Price Tab */}
        {tab === "fixed" && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {listings.map((l) => {
              const usd1Amount = l.price.toLocaleString();
              return (
                <div key={l.id} className="bg-navy-800 rounded-xl border border-white/5 overflow-hidden card-hover group">
                  <div className="aspect-[4/3] overflow-hidden bg-navy-900">
                    <img
                      src={l.image}
                      alt={l.name}
                      className="w-full h-full object-cover group-hover:scale-105 transition duration-500"
                    />
                  </div>
                  <div className="p-5">
                    <span className="text-[10px] font-bold tracking-widest text-gold-400 uppercase">Fixed Price</span>
                    <h3 className="text-white font-medium mt-1">{l.name}</h3>
                    <p className="text-gray-500 text-xs mt-1">{l.subtitle}</p>
                    <div className="flex items-center justify-between mt-4">
                      <div>
                        <p className="text-gray-500 text-[10px] uppercase tracking-wider">Price</p>
                        <p className="text-white font-semibold text-lg">{formatFullPrice(l.price)}</p>
                        <p className="text-gold-400 text-[10px]">{usd1Amount} {currency}</p>
                      </div>
                      {connected ? (
                        <button
                          onClick={() => handleBuyNow(l.id, l.price)}
                          disabled={buyingId === l.id}
                          className="px-4 py-2 bg-gold-500 hover:bg-gold-600 disabled:opacity-50 text-navy-900 rounded-lg text-sm font-medium transition"
                        >
                          {buyingId === l.id ? "Processing..." : "Buy Now"}
                        </button>
                      ) : (
                        <WalletMultiButton className="!bg-gold-500 hover:!bg-gold-600 !rounded-lg !h-9 !text-sm !font-medium" />
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
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {auctions.map((a) => (
              <AuctionCard key={a.id} auction={a} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
