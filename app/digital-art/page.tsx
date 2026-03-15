"use client";

import Link from "next/link";
import { useState, useEffect } from "react";
import { useConnection } from "@solana/wallet-adapter-react";
import { PublicKey } from "@solana/web3.js";
import { AuctionProgram } from "@/lib/auction-program";
import { AuctionCountdownTimer } from "@/components/AuctionCountdownTimer";

interface Collection {
  collectionAddress: string;
  name: string;
  image: string;
  supply?: number;
}

interface ActiveListing {
  mint: string;
  name: string;
  image: string;
  collection: string;
  price: number;
  listingType: "fixed" | "auction";
  endTime?: number;
  currentBid?: number;
}

export default function DigitalArtPage() {
  const { connection } = useConnection();
  const [collections, setCollections] = useState<Collection[]>([]);
  const [activeListings, setActiveListings] = useState<ActiveListing[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingListings, setLoadingListings] = useState(true);

  useEffect(() => {
    const fetchCollections = async () => {
      try {
        const res = await fetch("/api/admin/allowlist");
        const data = await res.json();
        // Deduplicate by name (e.g. Quekz has old collection + new WNS authority)
        const seen = new Map<string, Collection>();
        for (const c of (data.collections || [])) {
          if (!seen.has(c.name)) seen.set(c.name, c);
        }
        setCollections(Array.from(seen.values()));
      } catch (err) {
        console.error("Failed to fetch collections:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchCollections();
  }, []);

  useEffect(() => {
    const fetchListings = async () => {
      setLoadingListings(true);
      try {
        // Fetch all on-chain listings
        const auctionProgram = new AuctionProgram(connection, { publicKey: PublicKey.default });
        const listings = await auctionProgram.fetchAllListings();

        // Enrich with NFT metadata
        const enriched: ActiveListing[] = [];
        for (const listing of listings) {
          try {
            const res = await fetch(`/api/nft?mint=${listing.nft_mint.toBase58()}`);
            const nftData = await res.json();

            enriched.push({
              mint: listing.nft_mint.toBase58(),
              name: nftData.nft?.name || "Untitled",
              image: nftData.nft?.image || "/placeholder.png",
              collection: nftData.nft?.collection || "Unknown",
              price: listing.price.toNumber ? listing.price.toNumber() : listing.price,
              listingType: listing.listing_type.auction ? "auction" : "fixed",
              endTime: listing.end_time,
              currentBid: listing.current_bid.toNumber ? listing.current_bid.toNumber() : listing.current_bid,
            });
          } catch (err) {
            console.error("Failed to enrich listing:", err);
          }
        }

        setActiveListings(enriched);
      } catch (err) {
        console.error("Failed to fetch on-chain listings:", err);
      } finally {
        setLoadingListings(false);
      }
    };

    if (connection) {
      fetchListings();
    }
  }, [connection]);

  return (
    <div className="pt-24 pb-20">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <Link href="/" className="text-gold-500 hover:text-gold-400 text-sm font-medium transition mb-6 inline-block">
          ← Back to Home
        </Link>
        <p className="text-gold-400 text-xs font-bold tracking-[0.2em] uppercase mb-2">
          Curated Collections
        </p>
        <h1 className="font-serif text-4xl text-white mb-2">Digital Collectibles</h1>
        <p className="text-gray-400 text-sm mb-10 max-w-2xl">
          Browse verified Solana NFT collections on Artifacte. Each collection is curated and approved — list your NFTs or discover new ones.
        </p>

        {/* Collections Grid */}
        {loading ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-6 mb-16">
            {[...Array(8)].map((_, i) => (
              <div key={i} className="bg-dark-800 border border-white/5 rounded-xl h-72 animate-pulse" />
            ))}
          </div>
        ) : collections.length === 0 ? (
          <div className="bg-dark-800 border border-white/10 rounded-xl p-12 text-center mb-16">
            <div className="text-5xl mb-4">🎨</div>
            <p className="text-gray-400">No collections approved yet.</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-6 mb-16">
            {collections.map((collection) => (
              <Link
                key={collection.collectionAddress}
                href={`/digital-art/${collection.collectionAddress}`}
                className="bg-dark-800 border border-white/5 rounded-xl overflow-hidden group hover:border-gold-500/30 transition-all duration-300"
              >
                <div className="aspect-square overflow-hidden bg-dark-700 relative">
                  <img
                    src={collection.image}
                    alt={collection.name}
                    className="w-full h-full object-cover group-hover:scale-105 transition duration-500"
                    onError={(e) => { (e.target as HTMLImageElement).src = "/placeholder.png"; }}
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-dark-900/80 via-transparent to-transparent" />
                </div>
                <div className="p-4">
                  <h3 className="text-white font-semibold text-sm group-hover:text-gold-400 transition">
                    {collection.name}
                  </h3>
                  {collection.supply && (
                    <p className="text-gray-500 text-xs mt-1">{collection.supply.toLocaleString()} items</p>
                  )}
                </div>
              </Link>
            ))}
          </div>
        )}

        {/* Active Listings Section */}
        <div className="pt-10 border-t border-white/10">
          <p className="text-gold-400 text-xs font-bold tracking-[0.2em] uppercase mb-2">
            On-Chain Listings
          </p>
          <h2 className="font-serif text-3xl text-white mb-2">Active Auctions & Sales</h2>
          <p className="text-gray-400 text-sm mb-8 max-w-2xl">
            Live listings from our community. Bid on auctions or purchase fixed-price items instantly.
          </p>

          {loadingListings ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
              {[...Array(10)].map((_, i) => (
                <div key={i} className="bg-dark-800 border border-white/5 rounded-xl h-64 animate-pulse" />
              ))}
            </div>
          ) : activeListings.length === 0 ? (
            <div className="bg-dark-800 border border-white/10 rounded-xl p-12 text-center">
              <div className="text-5xl mb-4">📭</div>
              <h3 className="font-serif text-xl text-white mb-2">No Active Listings</h3>
              <p className="text-gray-400 text-sm mb-6">
                No NFTs are currently listed. Be the first to list from a collection!
              </p>
              <Link
                href="/list"
                className="inline-block px-6 py-3 bg-gold-500 hover:bg-gold-600 text-dark-900 font-semibold rounded-lg transition text-sm"
              >
                List Your NFT
              </Link>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
              {activeListings.map((listing) => (
                <Link
                  key={listing.mint}
                  href={`/digital-art/auction/${listing.mint}`}
                  className="bg-dark-800 border border-white/5 rounded-xl overflow-hidden group hover:border-gold-500/30 transition"
                >
                  <div className="aspect-square overflow-hidden bg-dark-700 relative">
                    <img
                      src={listing.image}
                      alt={listing.name}
                      loading="lazy"
                      className="w-full h-full object-cover group-hover:scale-105 transition duration-300"
                      onError={(e) => { (e.target as HTMLImageElement).src = "/placeholder.png"; }}
                    />
                  </div>
                  <div className="p-3 space-y-2">
                    <div>
                      <p className="text-white text-sm font-semibold truncate">{listing.name}</p>
                      <p className="text-gray-500 text-xs truncate">{listing.collection}</p>
                    </div>

                    {listing.listingType === "auction" && listing.endTime ? (
                      <div className="bg-dark-900 rounded px-2 py-1.5">
                        <div className="text-[9px] text-gray-400 mb-1">Ends in</div>
                        <div className="text-xs text-gold-400 font-semibold">
                          {(() => {
                            const now = Math.floor(Date.now() / 1000);
                            const diff = listing.endTime - now;
                            if (diff <= 0) return "Ended";
                            const days = Math.floor(diff / (24 * 60 * 60));
                            const hours = Math.floor((diff % (24 * 60 * 60)) / (60 * 60));
                            if (days > 0) return `${days}d ${hours}h`;
                            return `${hours}h`;
                          })()}
                        </div>
                      </div>
                    ) : null}

                    <div className="flex items-center justify-between pt-1">
                      <div>
                        <p className="text-gray-500 text-[10px] uppercase">
                          {listing.listingType === "auction" && listing.currentBid
                            ? "Current Bid"
                            : "Price"}
                        </p>
                        <p className="text-white font-semibold text-sm">
                          ◎ {listing.listingType === "auction" && listing.currentBid
                            ? (listing.currentBid / 1e9).toFixed(2)
                            : (listing.price / 1e9).toFixed(2)}
                        </p>
                      </div>
                      <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
                        listing.listingType === "auction"
                          ? "bg-purple-900/40 text-purple-300 border border-purple-700"
                          : "bg-green-900/40 text-green-300 border border-green-700"
                      }`}>
                        {listing.listingType === "auction" ? "Auction" : "Buy"}
                      </span>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
