"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { useWallet } from "@solana/wallet-adapter-react";

interface CollectionInfo {
  collectionAddress: string;
  name: string;
  image: string;
  supply?: number;
  description?: string;
}

interface ListedNFT {
  id: string;
  nftMint: string;
  nftName: string;
  nftImage: string;
  price: number;
  listingType: "fixed" | "auction";
  seller: string;
  status: string;
}

interface UserNFT {
  mint: string;
  name: string;
  image: string;
  collection: string;
}

export default function CollectionPage() {
  const params = useParams();
  const collectionAddress = params.collection as string;
  const { publicKey } = useWallet();

  const [collection, setCollection] = useState<CollectionInfo | null>(null);
  const [listings, setListings] = useState<ListedNFT[]>([]);
  const [userNFTs, setUserNFTs] = useState<UserNFT[]>([]);
  const [loading, setLoading] = useState(true);
  const [showUserNFTs, setShowUserNFTs] = useState(false);

  useEffect(() => {
    loadData();
  }, [collectionAddress, publicKey]);

  async function loadData() {
    setLoading(true);
    try {
      // Get collection info
      const alRes = await fetch("/api/admin/allowlist");
      const alData = await alRes.json();
      const col = (alData.collections || []).find(
        (c: any) => c.collectionAddress === collectionAddress
      );
      setCollection(col || null);

      // Find all addresses for this collection (e.g. Quekz has legacy + WNS)
      const colName = col?.name;
      const siblingAddresses: string[] = colName
        ? (alData.collections || [])
            .filter((c: any) => c.name === colName)
            .map((c: any) => c.collectionAddress)
        : [collectionAddress];

      // Get active on-chain listings for all sibling addresses
      const listingResults = await Promise.all(
        siblingAddresses.map((addr: string) =>
          fetch(`/api/on-chain-listings?collection=${addr}`)
            .then(r => r.json())
            .then(d => d.listings || [])
            .catch(() => [])
        )
      );
      setListings(listingResults.flat());

      // Get user's NFTs from all sibling addresses
      if (publicKey) {
        const nftResults = await Promise.all(
          siblingAddresses.map((addr: string) =>
            fetch(`/api/nfts?owner=${publicKey.toBase58()}&collection=${addr}`)
              .then(r => r.json())
              .then(d => d.nfts || [])
              .catch(() => [])
          )
        );
        setUserNFTs(nftResults.flat());
      }
    } catch (err) {
      console.error("Failed to load collection:", err);
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <main className="min-h-screen pt-32 pb-20">
        <div className="max-w-7xl mx-auto px-4 text-center">
          <div className="inline-block animate-spin mb-4">
            <div className="w-8 h-8 border-4 border-gray-700 border-t-gold-500 rounded-full" />
          </div>
          <p className="text-gray-400">Loading collection...</p>
        </div>
      </main>
    );
  }

  if (!collection) {
    return (
      <main className="min-h-screen pt-32 pb-20">
        <div className="max-w-2xl mx-auto px-4 text-center">
          <div className="text-5xl mb-4">🔍</div>
          <h2 className="font-serif text-2xl text-white mb-4">Collection Not Found</h2>
          <p className="text-gray-400 mb-6">This collection is not approved on Artifacte.</p>
          <Link href="/digital-art" className="text-gold-400 hover:text-gold-300 transition">
            ← Back to Collections
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen pt-24 pb-20">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Collection Header */}
        <div className="flex items-center gap-5 mb-10">
          <img
            src={collection.image}
            alt={collection.name}
            className="w-20 h-20 rounded-xl object-cover border border-white/10"
            onError={(e) => { (e.target as HTMLImageElement).src = "/placeholder.png"; }}
          />
          <div>
            <Link href="/digital-art" className="text-gold-500 hover:text-gold-400 text-sm mb-2 block">
              ← Back to Digital Collectibles
            </Link>
            <h1 className="font-serif text-3xl text-white">{collection.name}</h1>
            <div className="flex items-center gap-4 mt-1">
              {collection.supply && (
                <span className="text-gray-500 text-sm">{collection.supply.toLocaleString()} items</span>
              )}
              <span className="text-green-400 text-xs font-medium flex items-center gap-1">
                <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
                Verified Collection
              </span>
            </div>
            <p className="text-gray-600 text-xs font-mono mt-1">{collectionAddress}</p>
          </div>
        </div>

        {/* Collection Description */}
        {collection.description && (
          <div className="mb-10 max-w-3xl">
            <p className="text-gray-400 text-sm leading-relaxed">{collection.description}</p>
          </div>
        )}

        {/* User NFTs Section */}
        {userNFTs.length > 0 && (
          <div className="mb-16">
            <div className="flex items-center justify-between mb-6">
              <h2 className="font-serif text-2xl text-white">Your NFTs</h2>
              <button
                onClick={() => setShowUserNFTs(!showUserNFTs)}
                className="text-gold-400 hover:text-gold-300 text-sm transition"
              >
                {showUserNFTs ? "Hide" : "Show"}
              </button>
            </div>

            {showUserNFTs && (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                {userNFTs.map((nft) => (
                  <div
                    key={nft.mint}
                    className="bg-dark-800 border border-white/5 rounded-xl overflow-hidden group hover:border-gold-500/30 transition"
                  >
                    <div className="aspect-square overflow-hidden bg-dark-700">
                      <img
                        src={nft.image}
                        alt={nft.name}
                        className="w-full h-full object-cover group-hover:scale-105 transition duration-300"
                        onError={(e) => { (e.target as HTMLImageElement).src = "/placeholder.png"; }}
                      />
                    </div>
                    <div className="p-3">
                      <p className="text-white text-sm font-semibold truncate">{nft.name}</p>
                      <Link
                        href={`/list?mint=${nft.mint}`}
                        className="mt-2 block w-full text-center py-2 bg-gold-500 hover:bg-gold-600 text-dark-900 font-semibold text-xs rounded transition"
                      >
                        List Item
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Active Listings */}
        <div>
          <h2 className="font-serif text-2xl text-white mb-6">Active Listings</h2>
          {listings.length === 0 ? (
            <div className="bg-dark-800 border border-white/10 rounded-xl p-12 text-center">
              <div className="text-5xl mb-4">📭</div>
              <h3 className="font-serif text-xl text-white mb-2">No Listings Yet</h3>
              <p className="text-gray-400 mb-6 text-sm">
                No NFTs from this collection are currently listed on Artifacte.
              </p>
              {userNFTs.length > 0 && (
                <Link
                  href={`/list?collection=${collectionAddress}`}
                  className="inline-block px-6 py-3 bg-gold-500 hover:bg-gold-600 text-dark-900 font-semibold rounded-lg transition text-sm"
                >
                  List Your {collection.name} NFT
                </Link>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
              {listings.map((nft: any) => (
                <Link
                  key={nft.nftMint}
                  href={`/digital-art/auction/${nft.nftMint}`}
                  className="bg-dark-800 border border-white/5 rounded-xl overflow-hidden group hover:border-gold-500/30 transition"
                >
                  <div className="aspect-square overflow-hidden bg-dark-700">
                    <img
                      src={nft.nftImage}
                      alt={nft.nftName}
                      className="w-full h-full object-cover group-hover:scale-105 transition duration-300"
                      onError={(e) => { (e.target as HTMLImageElement).src = "/placeholder.png"; }}
                    />
                  </div>
                  <div className="p-3">
                    <p className="text-white text-sm font-semibold truncate">{nft.nftName}</p>
                    <div className="flex items-center justify-between mt-2">
                      <div>
                        <p className="text-gray-500 text-[10px] uppercase">
                          {nft.listingType === "auction" ? "Current Bid" : "Price"}
                        </p>
                        <p className="text-white font-semibold text-sm">◎ {nft.currentBid > 0 ? nft.currentBid : nft.price}</p>
                      </div>
                      <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
                        nft.listingType === "auction"
                          ? "bg-purple-900/40 text-purple-300 border border-purple-700"
                          : "bg-green-900/40 text-green-300 border border-green-700"
                      }`}>
                        {nft.listingType === "auction" ? "Auction" : "Buy Now"}
                      </span>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
