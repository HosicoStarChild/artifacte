"use client";

import { useWallet } from "@solana/wallet-adapter-react";
import dynamic from "next/dynamic";
import { useState, useEffect } from "react";
import Link from "next/link";
import { listings as allListings } from "@/lib/data";

const WalletMultiButton = dynamic(
  () => import("@solana/wallet-adapter-react-ui").then((m) => m.WalletMultiButton),
  { ssr: false }
);

type TabType = "active" | "completed" | "cancelled";

interface MyListing {
  id: string;
  name: string;
  image: string;
  category: string;
  price: number;
  status: "active" | "completed" | "cancelled";
  createdAt: string;
  endsAt?: string;
  currentBid?: number;
  bidsCount?: number;
  seller: string;
}

export default function MyListingsPage() {
  const { publicKey, connected } = useWallet();
  const [activeTab, setActiveTab] = useState<TabType>("active");
  const [myListings, setMyListings] = useState<MyListing[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>("");

  useEffect(() => {
    if (connected && publicKey) {
      fetchMyListings();
    }
  }, [connected, publicKey]);

  async function fetchMyListings() {
    setLoading(true);
    setError("");
    try {
      // In production, this would fetch from your backend
      // For now, we'll use mock data filtered by seller address
      const mockListings: MyListing[] = [
        {
          id: "ml1",
          name: "Rare Digital Artwork",
          image: "https://images.unsplash.com/photo-1541961017774-22349e4a1262?w=400",
          category: "DIGITAL_ART",
          price: 5.5,
          status: "active",
          createdAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
          endsAt: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString(),
          currentBid: 6.2,
          bidsCount: 4,
          seller: publicKey!.toBase58(),
        },
        {
          id: "ml2",
          name: "Vintage Sports Card",
          image: "https://images.unsplash.com/photo-1518611505868-48aeb845e7c6?w=400",
          category: "SPORTS_CARDS",
          price: 2500,
          status: "active",
          createdAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
          endsAt: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString(),
          currentBid: 2800,
          bidsCount: 12,
          seller: publicKey!.toBase58(),
        },
        {
          id: "ml3",
          name: "Collector's Watch",
          image: "https://images.unsplash.com/photo-1523170335258-f5ed11844a49?w=400",
          category: "WATCHES",
          price: 8500,
          status: "completed",
          createdAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
          seller: publicKey!.toBase58(),
        },
        {
          id: "ml4",
          name: "TCG Holographic Card",
          image: "https://images.unsplash.com/photo-1516975080664-ed2fc6a32937?w=400",
          category: "TCG_CARDS",
          price: 1200,
          status: "cancelled",
          createdAt: new Date(Date.now() - 15 * 24 * 60 * 60 * 1000).toISOString(),
          seller: publicKey!.toBase58(),
        },
      ];

      setMyListings(mockListings);
    } catch (err: any) {
      setError(err.message || "Failed to fetch listings");
    } finally {
      setLoading(false);
    }
  }

  function getFilteredListings(): MyListing[] {
    return myListings.filter((listing) => listing.status === activeTab);
  }

  function formatDate(dateString: string): string {
    const date = new Date(dateString);
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  }

  function getTimeRemaining(endsAt?: string): string {
    if (!endsAt) return "Ended";
    const now = Date.now();
    const end = new Date(endsAt).getTime();
    const diff = end - now;

    if (diff <= 0) return "Ended";
    if (diff < 60 * 60 * 1000) {
      return `${Math.floor(diff / (60 * 1000))}m left`;
    }
    if (diff < 24 * 60 * 60 * 1000) {
      return `${Math.floor(diff / (60 * 60 * 1000))}h left`;
    }
    return `${Math.floor(diff / (24 * 60 * 60 * 1000))}d left`;
  }

  const filteredListings = getFilteredListings();

  return (
    <main className="min-h-screen bg-dark-900 pt-32 pb-20">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mb-12">
          <h1 className="font-serif text-4xl md:text-5xl font-bold text-white mb-4">My Listings</h1>
          <p className="text-gray-400 text-lg">Manage your NFT listings on Artifacte</p>
        </div>

        {!connected ? (
          <div className="bg-dark-800 border border-white/10 rounded-xl p-8 md:p-12 text-center max-w-2xl mx-auto">
            <h2 className="font-serif text-2xl font-bold text-white mb-4">Connect Your Wallet</h2>
            <p className="text-gray-400 mb-8">
              You need to connect your wallet to view your listings.
            </p>
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
                  className={`px-6 py-4 font-semibold transition-all border-b-2 ${
                    activeTab === tab
                      ? "border-gold-500 text-gold-500"
                      : "border-transparent text-gray-400 hover:text-white"
                  }`}
                >
                  {tab === "active" && "Active"}
                  {tab === "completed" && "Completed"}
                  {tab === "cancelled" && "Cancelled"}
                  <span className="ml-2 text-sm opacity-75">({filteredListings.length})</span>
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
                <p className="text-gray-400 mb-6">
                  {activeTab === "active"
                    ? "You have no active listings"
                    : activeTab === "completed"
                    ? "You have no completed listings"
                    : "You have no cancelled listings"}
                </p>
                {activeTab === "active" && (
                  <Link
                    href="/list"
                    className="inline-block px-6 py-3 bg-gold-500 hover:bg-gold-600 text-dark-900 font-semibold rounded-lg transition-all"
                  >
                    Create New Listing
                  </Link>
                )}
              </div>
            )}

            {!loading && filteredListings.length > 0 && (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {filteredListings.map((listing) => (
                  <Link
                    key={listing.id}
                    href={`/auctions/${listing.id}`}
                    className="bg-dark-800 border border-white/10 rounded-xl overflow-hidden hover:border-gold-500 transition-all card-hover group"
                  >
                    {/* Image */}
                    <div className="aspect-square bg-dark-700 overflow-hidden relative">
                      <img
                        src={listing.image}
                        alt={listing.name}
                        className="w-full h-full object-cover image-hover"
                        onError={(e) => {
                          e.currentTarget.src = "https://via.placeholder.com/400?text=No+Image";
                        }}
                      />
                      
                      {/* Status Badge */}
                      <div className="absolute top-4 right-4 px-3 py-1 rounded-full text-xs font-semibold backdrop-blur-md">
                        {listing.status === "active" && (
                          <span className="bg-green-900/40 text-green-300 border border-green-700 px-3 py-1 rounded-full">
                            Active
                          </span>
                        )}
                        {listing.status === "completed" && (
                          <span className="bg-blue-900/40 text-blue-300 border border-blue-700 px-3 py-1 rounded-full">
                            Sold
                          </span>
                        )}
                        {listing.status === "cancelled" && (
                          <span className="bg-red-900/40 text-red-300 border border-red-700 px-3 py-1 rounded-full">
                            Cancelled
                          </span>
                        )}
                      </div>

                      {/* Time Remaining */}
                      {listing.status === "active" && listing.endsAt && (
                        <div className="absolute bottom-4 left-4 px-3 py-2 rounded-lg bg-dark-900/80 backdrop-blur-md border border-white/10">
                          <p className="text-xs text-gray-400">Time left</p>
                          <p className="text-sm font-semibold text-gold-500">
                            {getTimeRemaining(listing.endsAt)}
                          </p>
                        </div>
                      )}
                    </div>

                    {/* Content */}
                    <div className="p-4">
                      <h3 className="font-semibold text-white truncate mb-2 group-hover:text-gold-500 transition-colors">
                        {listing.name}
                      </h3>
                      <p className="text-xs text-gray-500 mb-4">{listing.category}</p>

                      {/* Price Info */}
                      <div className="space-y-2 mb-4 pb-4 border-t border-white/10 pt-4">
                        {listing.status === "active" && listing.currentBid ? (
                          <>
                            <div className="flex justify-between text-xs">
                              <span className="text-gray-500">Current Bid</span>
                              <span className="text-white font-semibold">${listing.currentBid.toFixed(0)}</span>
                            </div>
                            <div className="flex justify-between text-xs">
                              <span className="text-gray-500">Bids</span>
                              <span className="text-white font-semibold">{listing.bidsCount || 0}</span>
                            </div>
                          </>
                        ) : (
                          <div className="flex justify-between">
                            <span className="text-gray-500 text-xs">
                              {listing.status === "completed" ? "Sold for" : "Listed at"}
                            </span>
                            <span className="text-gold-500 font-semibold">${listing.price.toFixed(0)}</span>
                          </div>
                        )}
                      </div>

                      {/* Actions */}
                      <div className="flex gap-2">
                        <Link
                          href={`/auctions/${listing.id}`}
                          className="flex-1 px-3 py-2 bg-gold-500 hover:bg-gold-600 text-dark-900 text-xs font-semibold rounded-lg transition-all text-center"
                        >
                          View
                        </Link>
                        {listing.status === "active" && (
                          <button
                            onClick={(e) => {
                              e.preventDefault();
                              alert("Cancel listing feature coming soon");
                            }}
                            className="flex-1 px-3 py-2 border border-white/10 text-gray-400 hover:text-white text-xs font-semibold rounded-lg transition-all"
                          >
                            Cancel
                          </button>
                        )}
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            )}

            {/* Create New Listing Button */}
            {activeTab === "active" && (
              <div className="mt-12 text-center">
                <Link
                  href="/list"
                  className="inline-block px-8 py-4 bg-gold-500 hover:bg-gold-600 text-dark-900 font-semibold rounded-lg transition-all"
                >
                  + Create New Listing
                </Link>
              </div>
            )}
          </>
        )}
      </div>
    </main>
  );
}
