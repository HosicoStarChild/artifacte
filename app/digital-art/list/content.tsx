"use client";

import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useWallet, useConnection } from "@solana/wallet-adapter-react";
import { PublicKey } from "@solana/web3.js";
import { getAssociatedTokenAddress } from "@solana/spl-token";
import Link from "next/link";
import { AuctionProgram, ListingType, ItemCategory } from "@/lib/auction-program";
import { showToast } from "@/components/ToastContainer";

const SOL_MINT = new PublicKey("So11111111111111111111111111111111111111112");

interface OwnedNFT {
  mint: string;
  name: string;
  image: string;
  collection: string;
}

export default function ListPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { publicKey, connected, wallet } = useWallet();
  const { connection } = useConnection();

  const [step, setStep] = useState<"select" | "details">("select");
  const [selectedNFT, setSelectedNFT] = useState<OwnedNFT | null>(
    searchParams.get("mint") ? { mint: searchParams.get("mint")!, name: "", image: "", collection: "" } : null
  );
  const [ownedNFTs, setOwnedNFTs] = useState<OwnedNFT[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingNFTs, setLoadingNFTs] = useState(false);

  const [listingType, setListingType] = useState<"fixed" | "auction">("fixed");
  const [price, setPrice] = useState("");
  const [durationDays, setDurationDays] = useState(1);
  const [submitting, setSubmitting] = useState(false);
  const [txHash, setTxHash] = useState<string | null>(null);
  const [royaltyBps, setRoyaltyBps] = useState<number>(0);
  const [loadingRoyalty, setLoadingRoyalty] = useState(false);

  // Load whitelisted collections
  const [collections, setCollections] = useState<Set<string>>(new Set());

  useEffect(() => {
    fetch("/api/admin/allowlist")
      .then((res) => res.json())
      .then((data) => {
        const addresses = new Set<string>((data.collections || []).map((c: any) => c.collectionAddress));
        setCollections(addresses);
      })
      .catch(() => {});
  }, []);

  // Load owned NFTs from user's wallet
  useEffect(() => {
    if (!connected || !publicKey) return;

    setLoadingNFTs(true);
    fetch(`/api/nfts?owner=${publicKey.toBase58()}`)
      .then((res) => res.json())
      .then((data) => {
        // Filter to only whitelisted collections
        const filtered = (data.nfts || []).filter((nft: any) => collections.has(nft.collection));
        setOwnedNFTs(filtered);
      })
      .catch((err) => {
        console.error("Failed to load NFTs:", err);
        showToast.error("Failed to load your NFTs");
      })
      .finally(() => setLoadingNFTs(false));
  }, [connected, publicKey, collections]);

  const handleSelectNFT = async (nft: OwnedNFT) => {
    setSelectedNFT(nft);
    setStep("details");
    setLoadingRoyalty(true);
    try {
      const resp = await fetch(`/api/nft?mint=${nft.mint}`);
      const data = await resp.json();
      const asset = data.nft || data;
      // Check WNS mint_extensions first
      const addlMeta = asset.mint_extensions?.metadata?.additional_metadata || [];
      for (const [key, value] of addlMeta) {
        if (key === 'royalty_basis_points') {
          setRoyaltyBps(parseInt(value) || 0);
          setLoadingRoyalty(false);
          return;
        }
      }
      // Fallback to Metaplex royalty
      setRoyaltyBps(asset.royalty?.basis_points || 0);
    } catch {
      setRoyaltyBps(0);
    }
    setLoadingRoyalty(false);
  };

  const handleSubmitListing = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedNFT || !publicKey || !connected || !wallet) {
      showToast.error("Please connect your wallet first");
      return;
    }

    if (!price || parseFloat(price) <= 0) {
      showToast.error("Please enter a valid price");
      return;
    }

    setSubmitting(true);
    try {
      const nftMint = new PublicKey(selectedNFT.mint);
      const priceInLamports = Math.floor(parseFloat(price) * 1e9);
      const durationSeconds = durationDays * 24 * 60 * 60;

      // Get user's NFT account for the mint
      const sellerNftAccount = await getAssociatedTokenAddress(nftMint, publicKey);

      // Initialize AuctionProgram
      const auctionProgram = new AuctionProgram(connection, wallet);

      // Call listItem on-chain
      const tx = await auctionProgram.listItem(
        nftMint,
        sellerNftAccount,
        SOL_MINT,
        listingType === "auction" ? ListingType.Auction : ListingType.FixedPrice,
        priceInLamports,
        listingType === "auction" ? durationSeconds : undefined,
        ItemCategory.DigitalArt
      );

      setTxHash(tx);
      showToast.success("NFT listed successfully!");

      // Redirect to auction detail page after 2 seconds
      setTimeout(() => {
        router.push(`/digital-art/auction/${selectedNFT.mint}`);
      }, 2000);
    } catch (err: any) {
      console.error("Listing failed:", err);
      showToast.error(err.message || "Failed to list NFT");
    } finally {
      setSubmitting(false);
    }
  };

  if (!connected) {
    return (
      <div className="pt-24 pb-20 min-h-screen">
        <div className="max-w-2xl mx-auto px-4">
          <Link href="/digital-art" className="text-gold-500 hover:text-gold-400 text-sm font-medium transition mb-6 inline-block">
            ← Back to Digital Collectibles
          </Link>
          <div className="bg-dark-800 border border-white/10 rounded-xl p-12 text-center">
            <div className="text-5xl mb-4">🔐</div>
            <h2 className="font-serif text-2xl text-white mb-2">Connect Your Wallet</h2>
            <p className="text-gray-400 mb-6">
              Please connect your Solana wallet to list your NFTs.
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (txHash) {
    return (
      <div className="pt-24 pb-20 min-h-screen">
        <div className="max-w-2xl mx-auto px-4">
          <div className="bg-dark-800 border border-white/10 rounded-xl p-12 text-center">
            <div className="text-6xl mb-4">✅</div>
            <h2 className="font-serif text-2xl text-white mb-2">Listing Confirmed</h2>
            <p className="text-gray-400 text-sm mb-4">
              Your NFT has been listed successfully!
            </p>
            <p className="text-gray-500 text-xs font-mono break-all mb-6">
              {txHash}
            </p>
            <a
              href={`https://solscan.io/tx/${txHash}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-gold-500 hover:text-gold-400 text-sm transition"
            >
              View on Solscan →
            </a>
          </div>
        </div>
      </div>
    );
  }

  if (step === "select") {
    return (
      <div className="pt-24 pb-20 min-h-screen">
        <div className="max-w-4xl mx-auto px-4">
          <Link href="/digital-art" className="text-gold-500 hover:text-gold-400 text-sm font-medium transition mb-6 inline-block">
            ← Back to Digital Collectibles
          </Link>

          <div className="mb-12">
            <p className="text-gold-400 text-xs font-bold tracking-[0.2em] uppercase mb-2">List Your NFT</p>
            <h1 className="font-serif text-4xl text-white mb-2">Select an NFT to List</h1>
            <p className="text-gray-400 text-sm mb-6">
              Choose an NFT from your wallet that belongs to a whitelisted collection.
            </p>
          </div>

          {loadingNFTs ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-6">
              {[...Array(8)].map((_, i) => (
                <div key={i} className="bg-dark-800 border border-white/5 rounded-xl h-72 animate-pulse" />
              ))}
            </div>
          ) : ownedNFTs.length === 0 ? (
            <div className="bg-dark-800 border border-white/10 rounded-xl p-12 text-center">
              <div className="text-5xl mb-4">🎨</div>
              <h2 className="font-serif text-xl text-white mb-2">No NFTs Found</h2>
              <p className="text-gray-400 text-sm mb-6">
                You don't have any NFTs from whitelisted collections in your wallet.
              </p>
              <Link
                href="/digital-art"
                className="inline-block px-6 py-3 bg-gold-500 hover:bg-gold-600 text-dark-900 font-semibold rounded-lg transition text-sm"
              >
                Browse Collections
              </Link>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-6">
              {ownedNFTs.map((nft) => (
                <button
                  key={nft.mint}
                  onClick={() => handleSelectNFT(nft)}
                  className="bg-dark-800 border border-white/5 rounded-xl overflow-hidden group hover:border-gold-500/30 transition-all duration-300 text-left"
                >
                  <div className="aspect-square overflow-hidden bg-dark-700 relative">
                    <img
                      src={nft.image}
                      alt={nft.name}
                      className="w-full h-full object-cover group-hover:scale-105 transition duration-500"
                      onError={(e) => { (e.target as HTMLImageElement).src = "/placeholder.png"; }}
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-dark-900/80 via-transparent to-transparent" />
                  </div>
                  <div className="p-4">
                    <h3 className="text-white font-semibold text-sm group-hover:text-gold-400 transition truncate">
                      {nft.name}
                    </h3>
                    <p className="text-gray-500 text-xs mt-1">{nft.collection}</p>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  // Step 2: Listing Details
  return (
    <div className="pt-24 pb-20 min-h-screen">
      <div className="max-w-2xl mx-auto px-4">
        <Link
          href="/digital-art/list"
          className="text-gold-500 hover:text-gold-400 text-sm font-medium transition mb-6 inline-block"
        >
          ← Back to NFT Selection
        </Link>

        <div className="bg-dark-800 rounded-xl border border-white/5 p-8">
          <div className="flex items-start gap-6 mb-8">
            <div className="w-24 h-24 rounded-lg overflow-hidden flex-shrink-0 bg-dark-700">
              <img
                src={selectedNFT?.image || "/placeholder.png"}
                alt={selectedNFT?.name || "NFT"}
                className="w-full h-full object-cover"
                onError={(e) => { (e.target as HTMLImageElement).src = "/placeholder.png"; }}
              />
            </div>
            <div>
              <h2 className="font-serif text-2xl text-white mb-1">{selectedNFT?.name}</h2>
              <p className="text-gray-500 text-sm">{selectedNFT?.collection}</p>
              <p className="text-gray-600 text-xs font-mono mt-2 break-all">{selectedNFT?.mint}</p>
            </div>
          </div>

          <form onSubmit={handleSubmitListing} className="space-y-6">
            {/* Listing Type */}
            <div>
              <label className="block text-sm text-gold-400 mb-4 font-medium">Listing Type *</label>
              <div className="grid grid-cols-2 gap-4">
                {(["fixed", "auction"] as const).map((type) => (
                  <button
                    key={type}
                    type="button"
                    onClick={() => setListingType(type)}
                    className={`p-4 rounded-lg border transition ${
                      listingType === type
                        ? "border-gold-500 bg-gold-500/10"
                        : "border-white/10 bg-dark-900 hover:border-white/20"
                    }`}
                  >
                    <div className="text-2xl mb-1">{type === "fixed" ? "💰" : "🏆"}</div>
                    <div className="text-white font-semibold text-sm">
                      {type === "fixed" ? "Fixed Price" : "Auction"}
                    </div>
                    <div className="text-gray-400 text-xs mt-1">
                      {type === "fixed"
                        ? "Instant purchase"
                        : "Highest bidder wins"}
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* Price */}
            <div>
              <label className="block text-sm text-gold-400 mb-2 font-medium">
                {listingType === "auction" ? "Starting Bid" : "Price"} (SOL) *
              </label>
              <div className="flex items-center gap-2">
                <span className="text-white text-lg">◎</span>
                <input
                  type="number"
                  step="0.1"
                  min="0"
                  required
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                  className="flex-1 bg-dark-900 border border-white/10 rounded-lg px-4 py-2.5 text-white text-sm focus:outline-none focus:border-gold-500 transition"
                  placeholder="0.00"
                />
              </div>
            </div>

            {/* Duration (for auctions) */}
            {listingType === "auction" && (
              <div>
                <label className="block text-sm text-gold-400 mb-2 font-medium">Duration *</label>
                <select
                  value={durationDays}
                  onChange={(e) => setDurationDays(parseInt(e.target.value))}
                  className="w-full bg-dark-900 border border-white/10 rounded-lg px-4 py-2.5 text-white text-sm focus:outline-none focus:border-gold-500 transition"
                >
                  <option value={1}>1 Day</option>
                  <option value={3}>3 Days</option>
                  <option value={7}>7 Days</option>
                </select>
              </div>
            )}

            {/* Fee Breakdown */}
            {price && (
              <div className="bg-dark-900 border border-white/10 rounded-lg p-4 space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-400">Your {listingType === "auction" ? "Starting Bid" : "Listing Price"}:</span>
                  <span className="text-white font-medium">◎ {price}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Platform Fee:</span>
                  <span className="text-gray-300">2%</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Creator Royalty:</span>
                  <span className="text-gray-300">{loadingRoyalty ? "..." : `${(royaltyBps / 100).toFixed(1)}%`}</span>
                </div>
                {(() => {
                  const p = parseFloat(price);
                  const totalFeeRate = 0.02 + royaltyBps / 10000;
                  const youReceive = p * (1 - totalFeeRate);
                  return (
                    <div className="border-t border-white/10 pt-2 mt-2 flex justify-between">
                      <span className="text-gray-300">You receive:</span>
                      <span className="text-gold-400 font-semibold">◎ {youReceive.toFixed(4)}</span>
                    </div>
                  );
                })()}
                <p className="text-gray-600 text-xs pt-1">Fees are only charged when your item sells. No sale, no fee.</p>
              </div>
            )}

            {/* Submit Button */}
            <button
              type="submit"
              disabled={submitting || !price}
              className={`w-full py-3 rounded-lg font-semibold text-sm transition mt-8 ${
                submitting || !price
                  ? "bg-gray-700 text-gray-400 cursor-not-allowed"
                  : "bg-gold-500 hover:bg-gold-600 text-dark-900"
              }`}
            >
              {submitting ? "Listing..." : "List NFT"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
