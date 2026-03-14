"use client";

import { useWallet, useConnection } from "@solana/wallet-adapter-react";
import dynamic from "next/dynamic";
import { useState, useEffect } from "react";
import Link from "next/link";
import { PublicKey } from "@solana/web3.js";
import { AuctionProgram } from "@/lib/auction-program";

const WalletMultiButton = dynamic(
  () => import("@solana/wallet-adapter-react-ui").then((m) => m.WalletMultiButton),
  { ssr: false }
);

type TabType = "active" | "completed" | "cancelled";

interface MyListing {
  id: string;
  name: string;
  image: string;
  nftMint: string;
  price: number;
  currency: string;
  status: "active" | "completed" | "cancelled";
  listingType: string;
  endsAt?: number;
  currentBid?: number;
  highestBidder?: string;
  royaltyBps: number;
}

export default function MyListingsPage() {
  const { publicKey, connected, wallet } = useWallet();
  const { connection } = useConnection();
  const [activeTab, setActiveTab] = useState<TabType>("active");
  const [myListings, setMyListings] = useState<MyListing[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>("");

  useEffect(() => {
    if (connected && publicKey) {
      fetchMyListings();
    } else {
      setMyListings([]);
    }
  }, [connected, publicKey]);

  async function fetchMyListings() {
    if (!publicKey || !wallet) return;
    setLoading(true);
    setError("");
    try {
      const dummyWallet = {
        publicKey,
        signTransaction: async (tx: any) => tx,
        signAllTransactions: async (txs: any) => txs,
      };
      const program = new AuctionProgram(connection, dummyWallet);
      const allListings = await program.fetchAllListings();

      // Filter listings where seller is the connected wallet
      const mine = allListings.filter(
        (l: any) => l.account.seller.toBase58() === publicKey.toBase58()
      );

      // Fetch NFT metadata for each listing
      const enriched: MyListing[] = await Promise.all(
        mine.map(async (l: any) => {
          const acc = l.account;
          const mintAddr = acc.nftMint.toBase58();
          let name = mintAddr.slice(0, 8) + "...";
          let image = "/placeholder-card.svg";

          try {
            const resp = await fetch(`/api/nft?mint=${mintAddr}`);
            const data = await resp.json();
            const nft = data.nft || data;
            name = nft.name || nft.content?.metadata?.name || name;
            const rawImage = nft.image || nft.content?.links?.image || nft.content?.files?.[0]?.uri || "";
            // Proxy arweave/IPFS images
            if (rawImage.includes("arweave.net") || rawImage.includes("irys.xyz")) {
              image = `/api/img-proxy?url=${encodeURIComponent(rawImage)}`;
            } else if (rawImage) {
              image = rawImage;
            }
          } catch {}

          // Determine status
          let status: "active" | "completed" | "cancelled" = "active";
          const statusObj = acc.status;
          if (statusObj.settled !== undefined) status = "completed";
          else if (statusObj.cancelled !== undefined) status = "cancelled";

          // Determine listing type
          const isAuction = acc.listingType?.auction !== undefined;

          // Currency
          const paymentMint = acc.paymentMint.toBase58();
          const currency = paymentMint === "So11111111111111111111111111111111111111112" ? "SOL"
            : paymentMint === "USD1ttGY1N17NEEHLmELoaybftRBUSErhqYiQzvEmuB" ? "USD1"
            : "USDC";

          // Price in human-readable
          const decimals = currency === "SOL" ? 9 : 6;
          const price = Number(acc.price) / Math.pow(10, decimals);
          const currentBid = Number(acc.currentBid) / Math.pow(10, decimals);

          return {
            id: l.publicKey.toBase58(),
            name,
            image,
            nftMint: mintAddr,
            price,
            currency,
            status,
            listingType: isAuction ? "Auction" : "Fixed Price",
            endsAt: isAuction && acc.endTime ? Number(acc.endTime) * 1000 : undefined,
            currentBid: currentBid > 0 ? currentBid : undefined,
            highestBidder: acc.highestBidder?.toBase58() !== PublicKey.default.toBase58() ? acc.highestBidder?.toBase58() : undefined,
            royaltyBps: acc.royaltyBasisPoints || 0,
          };
        })
      );

      setMyListings(enriched);
    } catch (err: any) {
      console.error("Failed to fetch listings:", err);
      setError(err.message || "Failed to fetch listings");
    } finally {
      setLoading(false);
    }
  }

  function getFilteredListings(): MyListing[] {
    return myListings.filter((listing) => listing.status === activeTab);
  }

  function getTabCount(tab: TabType): number {
    return myListings.filter((l) => l.status === tab).length;
  }

  function getTimeRemaining(endsAt?: number): string {
    if (!endsAt) return "";
    const diff = endsAt - Date.now();
    if (diff <= 0) return "Ended";
    if (diff < 60 * 60 * 1000) return `${Math.floor(diff / (60 * 1000))}m left`;
    if (diff < 24 * 60 * 60 * 1000) return `${Math.floor(diff / (60 * 60 * 1000))}h left`;
    return `${Math.floor(diff / (24 * 60 * 60 * 1000))}d left`;
  }

  const filteredListings = getFilteredListings();

  return (
    <main className="min-h-screen bg-dark-900 pt-32 pb-20">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="mb-12">
          <Link href="/" className="text-gold-500 hover:text-gold-400 text-sm mb-4 inline-block">← Back to Home</Link>
          <h1 className="font-serif text-4xl md:text-5xl font-bold text-white mb-4">My Listings</h1>
          <p className="text-gray-400 text-lg">Manage your NFT listings on Artifacte</p>
        </div>

        {!connected ? (
          <div className="bg-dark-800 border border-white/10 rounded-xl p-8 md:p-12 text-center max-w-2xl mx-auto">
            <h2 className="font-serif text-2xl font-bold text-white mb-4">Connect Your Wallet</h2>
            <p className="text-gray-400 mb-8">Connect your wallet to view your listings.</p>
            <div className="flex justify-center">
              <WalletMultiButton className="!bg-gold-500 hover:!bg-gold-600 !rounded-lg !h-12 !text-sm !font-semibold !px-8" />
            </div>
          </div>
        ) : (
          <>
            {/* Tabs */}
            <div className="mb-8 flex gap-4 border-b border-white/10">
              {(["active", "completed", "cancelled"] as TabType[]).map((tab) => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={`px-6 py-4 font-semibold transition-all border-b-2 capitalize ${
                    activeTab === tab
                      ? "border-gold-500 text-gold-500"
                      : "border-transparent text-gray-400 hover:text-white"
                  }`}
                >
                  {tab}
                  <span className="ml-2 text-sm opacity-75">({getTabCount(tab)})</span>
                </button>
              ))}
            </div>

            {loading && (
              <div className="text-center py-12">
                <div className="inline-block animate-spin">
                  <div className="w-8 h-8 border-4 border-gray-700 border-t-gold-500 rounded-full" />
                </div>
                <p className="text-gray-400 mt-4">Loading your listings...</p>
              </div>
            )}

            {error && (
              <div className="bg-red-900/20 border border-red-700 rounded-lg p-4 mb-6 text-red-400">
                {error}
              </div>
            )}

            {!loading && filteredListings.length === 0 && (
              <div className="bg-dark-800 border border-white/10 rounded-xl p-12 text-center">
                <p className="text-gray-400">
                  {activeTab === "active"
                    ? "You have no active listings"
                    : activeTab === "completed"
                    ? "No completed sales yet"
                    : "No cancelled listings"}
                </p>
              </div>
            )}

            {!loading && filteredListings.length > 0 && (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {filteredListings.map((listing) => (
                  <Link
                    key={listing.id}
                    href={`/digital-art/auction/${listing.nftMint}`}
                    className="bg-dark-800 border border-white/10 rounded-xl overflow-hidden hover:border-gold-500/50 transition-all block"
                  >
                    {/* Image */}
                    <div className="aspect-square bg-dark-700 overflow-hidden relative">
                      <img
                        src={listing.image}
                        alt={listing.name}
                        className="w-full h-full object-cover"
                        onError={(e) => {
                          e.currentTarget.src = "/placeholder-card.svg";
                        }}
                      />
                      
                      <div className="absolute top-3 right-3">
                        {listing.status === "active" && (
                          <span className="bg-green-900/60 text-green-300 border border-green-700/50 px-3 py-1 rounded-full text-xs font-semibold backdrop-blur-sm">
                            Active
                          </span>
                        )}
                        {listing.status === "completed" && (
                          <span className="bg-blue-900/60 text-blue-300 border border-blue-700/50 px-3 py-1 rounded-full text-xs font-semibold backdrop-blur-sm">
                            Sold
                          </span>
                        )}
                        {listing.status === "cancelled" && (
                          <span className="bg-red-900/60 text-red-300 border border-red-700/50 px-3 py-1 rounded-full text-xs font-semibold backdrop-blur-sm">
                            Cancelled
                          </span>
                        )}
                      </div>

                      {listing.status === "active" && listing.endsAt && (
                        <div className="absolute bottom-3 left-3 px-3 py-1.5 rounded-lg bg-dark-900/80 backdrop-blur-sm border border-white/10">
                          <p className="text-xs text-gold-500 font-semibold">
                            {getTimeRemaining(listing.endsAt)}
                          </p>
                        </div>
                      )}

                      <div className="absolute top-3 left-3">
                        <span className="bg-dark-900/80 backdrop-blur-sm text-gray-300 px-2 py-1 rounded text-xs">
                          {listing.listingType}
                        </span>
                      </div>
                    </div>

                    {/* Content */}
                    <div className="p-4">
                      <h3 className="font-semibold text-white truncate mb-1">{listing.name}</h3>
                      <p className="text-xs text-gray-500 mb-4 font-mono truncate">{listing.nftMint}</p>

                      <div className="space-y-2 pt-3 border-t border-white/10">
                        <div className="flex justify-between text-sm">
                          <span className="text-gray-500">
                            {listing.listingType === "Auction" ? "Starting Price" : "Price"}
                          </span>
                          <span className="text-white font-semibold">
                            {listing.price} {listing.currency}
                          </span>
                        </div>
                        {listing.currentBid !== undefined && (
                          <div className="flex justify-between text-sm">
                            <span className="text-gray-500">Current Bid</span>
                            <span className="text-gold-500 font-semibold">
                              {listing.currentBid} {listing.currency}
                            </span>
                          </div>
                        )}
                        {/* royalty removed */}
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </main>
  );
}
