"use client";

import Link from "next/link";
import { useState, useEffect } from "react";

interface Collection {
  collectionAddress: string;
  name: string;
  image: string;
  supply?: number;
}

export default function DigitalArtPage() {
  const [collections, setCollections] = useState<Collection[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/admin/allowlist")
      .then(res => res.json())
      .then(data => {
        setCollections(data.collections || []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  return (
    <div className="pt-24 pb-20">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <p className="text-gold-400 text-xs font-bold tracking-[0.2em] uppercase mb-2">
          Curated Collections
        </p>
        <h1 className="font-serif text-4xl text-white mb-2">Digital Collectibles</h1>
        <p className="text-gray-400 text-sm mb-10 max-w-2xl">
          Browse verified Solana NFT collections on Artifacte. Each collection is curated and approved — list your NFTs or discover new ones.
        </p>

        {loading ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-6">
            {[...Array(8)].map((_, i) => (
              <div key={i} className="bg-dark-800 border border-white/5 rounded-xl h-72 animate-pulse" />
            ))}
          </div>
        ) : collections.length === 0 ? (
          <div className="bg-dark-800 border border-white/10 rounded-xl p-12 text-center">
            <div className="text-5xl mb-4">🎨</div>
            <p className="text-gray-400">No collections approved yet.</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-6">
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
      </div>
    </div>
  );
}
