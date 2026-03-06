"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { auctions, listings, formatFullPrice, categorySlugMap, categoryLabels, BAXUS_SELLER_FEE_ENABLED, BAXUS_SELLER_FEE_PERCENT } from "@/lib/data";
import AuctionCard from "@/components/AuctionCard";
import VerifiedBadge from "@/components/VerifiedBadge";
import { useWallet } from "@solana/wallet-adapter-react";
import { useConnection } from "@solana/wallet-adapter-react";
import { PublicKey, Transaction, SystemProgram, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { createTransferInstruction, getAssociatedTokenAddress } from "@solana/spl-token";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useAuctionProgram } from "@/hooks/useAuctionProgram";
import { AuctionProgram } from "@/lib/auction-program";
import { showToast } from "@/components/ToastContainer";

const WalletMultiButton = dynamic(
  () => import("@solana/wallet-adapter-react-ui").then((m) => m.WalletMultiButton),
  { ssr: false }
);

const TREASURY = new PublicKey("DDSpvAK8DbuAdEaaBHkfLieLPSJVCWWgquFAA3pvxXoX");
const TOKENS: Record<string, { mint: PublicKey; decimals: number; label: string }> = {
  USD1: { mint: new PublicKey("USD1ttGY1N17NEEHLmELoaybftRBUSErhqYiQzvEmuB"), decimals: 6, label: "USD1" },
  USDC: { mint: new PublicKey("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"), decimals: 6, label: "USDC" },
};

const categoryEmojis: Record<string, string> = {
  "digital-art": "🎨",
  "spirits": "🥃",
  "tcg-cards": "🃏",
  "sports-cards": "⚽",
  "watches": "⌚",
};

export default function CategoryAuctionsPage() {
  const params = useParams();
  const categorySlug = params.category as string;
  const category = categorySlugMap[categorySlug];
  const [tab, setTab] = useState<"fixed" | "live">("fixed");
  const { publicKey, sendTransaction, connected } = useWallet();
  const { connection } = useConnection();
  const auctionProgram = useAuctionProgram();
  const [buyingId, setBuyingId] = useState<string | null>(null);
  const [currency, setCurrency] = useState<"USD1" | "USDC">("USD1");
  const [filters, setFilters] = useState<Record<string, string>>({});

  // Category-specific filter options
  const categoryFilters: Record<string, { label: string; key: string; options: string[] }[]> = {
    TCG_CARDS: [
      { label: "TCG", key: "tcg", options: ["All", "One Piece", "Pokemon", "Dragon Ball Z", "Magic", "Yu-Gi-Oh"] },
      { label: "Rarity", key: "rarity", options: ["All", "Common", "Rare", "Ultra Rare", "Secret Rare", "Alt Art", "Manga Alt Art"] },
      { label: "Grade", key: "grade", options: ["All", "PSA 10", "PSA 9", "BGS 9.5", "BGS 10", "CGC 9", "CGC 10"] },
      { label: "Language", key: "language", options: ["All", "EN", "JPN"] },
    ],
    SPIRITS: [
      { label: "Type", key: "spiritType", options: ["All", "Bourbon", "Scotch", "Whisky", "Tequila", "Rum", "Cognac", "Wine"] },
    ],
    WATCHES: [
      { label: "Brand", key: "brand", options: ["All", "Rolex", "Patek Philippe", "Audemars Piguet", "Omega", "Cartier", "Hublot", "Richard Mille"] },
    ],
    SPORTS_CARDS: [
      { label: "Sport", key: "sport", options: ["All", "Baseball", "Basketball", "Football", "Soccer"] },
      { label: "Grade", key: "grade", options: ["All", "PSA 10", "PSA 9", "BGS 9.5", "BGS 10", "SGC 10"] },
      { label: "Brand", key: "brand", options: ["All", "Topps", "Panini", "Upper Deck"] },
    ],
    DIGITAL_ART: [
      { label: "Collection", key: "collection", options: ["All", "SMB Gen 2", "SMB Gen 3", "Claynosaurz", "Galactic Gecko", "Famous Fox Federation", "Mad Lads", "Sensei"] },
    ],
  };

  const isDigitalArt = category === "DIGITAL_ART";

  const handleBuyNow = async (listingId: string, price: number, nftMint?: string) => {
    if (!connected || !publicKey) {
      showToast.error("Please connect your wallet first");
      return;
    }

    setBuyingId(listingId);
    try {
      let sig: string = "";

      // Use AuctionProgram if listing has nftMint (real on-chain listing)
      if (nftMint && auctionProgram) {
        try {
          const nftMintPubkey = new PublicKey(nftMint);
          const token = TOKENS[currency];
          
          // Get buyer's NFT account (where they'll receive the NFT)
          const buyerNftAccount = await getAssociatedTokenAddress(nftMintPubkey, publicKey);
          
          // Get payment accounts
          const buyerPaymentAccount = await getAssociatedTokenAddress(token.mint, publicKey);
          const sellerPaymentAccount = await getAssociatedTokenAddress(token.mint, publicKey);
          
          sig = await auctionProgram.buyNow(
            nftMintPubkey,
            sellerPaymentAccount,
            buyerPaymentAccount,
            buyerNftAccount,
            Math.round(price * (10 ** token.decimals)),
            token.mint
          );
        } catch (programErr: any) {
          // Fall back to direct transfer if program call fails
          console.warn("AuctionProgram.buyNow failed, falling back to direct transfer:", programErr);
          throw new Error(`On-chain purchase failed: ${programErr.message?.slice(0, 50)}`);
        }
      } else {
        // Mock listing: use direct transfer
        let tx: Transaction;

        if (isDigitalArt) {
          // Digital Art pays in SOL
          const lamports = Math.round(price * LAMPORTS_PER_SOL);
          tx = new Transaction().add(
            SystemProgram.transfer({
              fromPubkey: publicKey,
              toPubkey: TREASURY,
              lamports,
            })
          );
        } else {
          // RWA categories pay in USD1/USDC
          const token = TOKENS[currency];
          const tokenAmount = BigInt(Math.round(price * 10 ** token.decimals));
          const senderAta = await getAssociatedTokenAddress(token.mint, publicKey);
          const treasuryAta = await getAssociatedTokenAddress(token.mint, TREASURY);
          tx = new Transaction().add(
            createTransferInstruction(senderAta, treasuryAta, publicKey, tokenAmount)
          );
        }

        sig = await sendTransaction(tx, connection);
        await connection.confirmTransaction(sig, "confirmed");
      }

      showToast.success(`✓ Purchase successful! TX: ${sig.slice(0, 12)}...`);
    } catch (err: any) {
      const message = err.message || "Transaction failed";
      
      if (message.includes("User rejected")) {
        showToast.error("Transaction rejected by user");
      } else if (message.includes("insufficient")) {
        showToast.error(`Insufficient balance. Required: ${price} ${isDigitalArt ? "SOL" : currency}`);
      } else {
        showToast.error(`Error: ${message.slice(0, 80)}`);
      }
    } finally {
      setBuyingId(null);
    }
  };

  // Filter auctions and listings by category
  const categoryAuctions = category ? auctions.filter((a) => a.category === category) : [];
  const categoryListings = category ? listings.filter((l) => l.category === category) : [];

  if (!category) {
    return (
      <div className="pt-24 pb-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center py-20">
            <h1 className="font-serif text-4xl text-white mb-4">Category Not Found</h1>
            <p className="text-gray-400 mb-8">The category you're looking for doesn't exist.</p>
            <Link href="/" className="text-gold-500 hover:text-gold-400 font-medium">
              ← Back to Home
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const categoryName = categoryLabels[category] || category;
  const emoji = categoryEmojis[categorySlug] || "🎯";

  return (
    <div className="pt-24 pb-20">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mb-12">
          <Link href="/" className="text-gold-500 hover:text-gold-400 text-sm font-medium transition mb-6 inline-block">
            ← Back to Home
          </Link>
          <div className="flex items-start gap-6 mb-6">
            <div className="text-6xl">{emoji}</div>
            <div>
              <p className="text-gold-500 text-xs font-semibold tracking-widest uppercase mb-3">Category</p>
              <h1 className="font-serif text-4xl md:text-5xl text-white mb-3">{categoryName}</h1>
              <p className="text-gray-400 text-base max-w-2xl">
                Discover authenticated {categoryName.toLowerCase()} tokenized on Solana. Bid on live auctions or purchase items at fixed prices.
              </p>
            </div>
          </div>
        </div>

        {/* Tabs & Filters */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6 mb-10 pb-8 border-b border-white/5">
          {/* Tabs */}
          <div className="flex gap-3 bg-dark-800 rounded-lg p-1 border border-white/5">
            <button
              onClick={() => setTab("fixed")}
              className={`px-6 py-2.5 rounded-md text-sm font-medium transition-colors duration-200 ${
                tab === "fixed" ? "bg-gold-500 text-dark-900" : "text-gray-400 hover:text-white"
              }`}
            >
              Fixed Price
            </button>
            <button
              onClick={() => setTab("live")}
              className={`px-6 py-2.5 rounded-md text-sm font-medium transition-colors duration-200 ${
                tab === "live" ? "bg-gold-500 text-dark-900" : "text-gray-400 hover:text-white"
              }`}
            >
              Live Auctions
            </button>
          </div>

          {/* Currency Selector - only for non-Digital Art categories */}
          {!isDigitalArt && (
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
          )}
          {isDigitalArt && (
            <div className="flex items-center gap-3">
              <span className="text-gray-500 text-xs font-medium tracking-wider">Pay with:</span>
              <span className="text-white text-sm font-medium bg-dark-800 px-4 py-2 rounded-lg border border-white/5">◎ SOL</span>
            </div>
          )}
        </div>

        {/* Category Filters */}
        {category && categoryFilters[category] && (
          <div className="flex flex-wrap gap-3 mb-8">
            {categoryFilters[category].map((filter) => (
              <div key={filter.key} className="relative">
                <select
                  value={filters[filter.key] || "All"}
                  onChange={(e) => setFilters({ ...filters, [filter.key]: e.target.value })}
                  className="appearance-none bg-dark-800 border border-white/10 text-white text-sm rounded-lg px-4 py-2.5 pr-8 focus:border-gold-500 focus:outline-none transition-colors cursor-pointer hover:border-white/20"
                >
                  {filter.options.map((opt) => (
                    <option key={opt} value={opt} className="bg-dark-900">
                      {opt === "All" ? `${filter.label}: All` : opt}
                    </option>
                  ))}
                </select>
                <div className="absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none text-gray-500 text-xs">▼</div>
              </div>
            ))}
            {Object.values(filters).some((v) => v && v !== "All") && (
              <button
                onClick={() => setFilters({})}
                className="text-gold-500 hover:text-gold-400 text-sm font-medium px-3 py-2 transition-colors"
              >
                Clear filters ✕
              </button>
            )}
          </div>
        )}

        {/* Fixed Price Tab */}
        {tab === "fixed" && (
          <>
            {categoryListings.length > 0 ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8">
                {categoryListings.map((l) => {
                  const usd1Amount = l.price.toLocaleString();
                  return (
                    <div
                      key={l.id}
                      className="bg-dark-800 rounded-lg border border-white/5 overflow-hidden card-hover group flex flex-col h-full"
                    >
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
                          <p className="text-gray-500 text-xs mb-1">{l.subtitle}</p>
                          <p className="text-gray-600 text-xs mb-4">{categoryName}</p>
                        </div>
                        <div className="space-y-4">
                          <div>
                            <p className="text-gray-500 text-xs font-medium tracking-wider mb-1">Price</p>
                            {isDigitalArt ? (
                              <>
                                <p className="text-white font-serif text-2xl">◎ {l.price.toLocaleString()}</p>
                                <p className="text-gold-500 text-xs mt-1">SOL</p>
                              </>
                            ) : (
                              <>
                                <p className="text-white font-serif text-2xl">{formatFullPrice(l.price)}</p>
                                <p className="text-gold-500 text-xs mt-1">
                                  {usd1Amount} {currency}
                                </p>
                                {BAXUS_SELLER_FEE_ENABLED && l.verifiedBy === "BAXUS" && (
                                  <p className="text-gray-500 text-xs mt-1">+ {BAXUS_SELLER_FEE_PERCENT}% seller fee</p>
                                )}
                              </>
                            )}
                          </div>
                          {connected ? (
                            <button
                              onClick={() => handleBuyNow(l.id, l.price, (l as any).nftMint)}
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
            ) : (
              <div className="text-center py-20">
                <p className="text-gray-400 text-lg mb-4">No fixed price items available in this category</p>
                <Link href="/auctions" className="text-gold-500 hover:text-gold-400 font-medium">
                  View all auctions →
                </Link>
              </div>
            )}
          </>
        )}

        {/* Live Auctions Tab */}
        {tab === "live" && (
          <>
            {categoryAuctions.length > 0 ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-8">
                {categoryAuctions.map((a) => (
                  <AuctionCard key={a.id} auction={a} />
                ))}
              </div>
            ) : (
              <div className="text-center py-20">
                <p className="text-gray-400 text-lg mb-4">No live auctions available in this category</p>
                <Link href="/auctions" className="text-gold-500 hover:text-gold-400 font-medium">
                  View all auctions →
                </Link>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
