"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import VerifiedBadge from "@/components/VerifiedBadge";

interface MEListing {
  id: string;
  name: string;
  subtitle: string;
  price: number;
  image: string;
  currency: string;
  verifiedBy: string;
  ccCategory: string;
}

function TCGCarousel({ title, emoji, items, bg }: { title: string; emoji: string; items: MEListing[]; bg?: string }) {
  return (
    <section className={`${bg || ''} py-20 px-4 sm:px-6 lg:px-8`}>
      <div className="max-w-7xl mx-auto">
        <div className="flex items-center justify-between mb-12">
          <div>
            <p className="text-gold-500 text-xs font-semibold tracking-widest uppercase mb-2">Top Listings</p>
            <h2 className="font-serif text-3xl md:text-4xl text-white">{title} {emoji}</h2>
          </div>
          <Link href="/auctions/categories/tcg-cards" className="text-gold-500 hover:text-gold-400 text-sm font-medium transition">
            View All TCG →
          </Link>
        </div>
        {items.length === 0 ? (
          <div className="flex gap-6">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="flex-shrink-0 w-72 bg-dark-800 rounded-lg border border-white/5 overflow-hidden animate-pulse">
                <div className="aspect-square bg-dark-700" />
                <div className="p-5 space-y-3">
                  <div className="h-3 bg-dark-700 rounded w-20" />
                  <div className="h-4 bg-dark-700 rounded w-48" />
                  <div className="h-3 bg-dark-700 rounded w-32" />
                  <div className="h-6 bg-dark-700 rounded w-24 mt-4" />
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="overflow-x-auto pb-4 -mx-4 px-4">
            <div className="flex gap-6 snap-x">
              {items.map((l) => (
                <Link key={l.id} href={`/auctions/cards/${l.id}`} className="flex-shrink-0 w-72 snap-start group">
                  <div className="bg-dark-800 rounded-lg border border-white/5 overflow-hidden card-hover h-full flex flex-col">
                    <div className="aspect-square overflow-hidden bg-dark-900">
                      <img
                        src={l.image}
                        alt={l.name}
                        className="w-full h-full object-contain p-2 group-hover:scale-105 transition duration-500"
                      />
                    </div>
                    <div className="p-5 flex-1 flex flex-col justify-between">
                      <div>
                        <div className="flex items-start justify-between gap-2 mb-2">
                          <span className="text-xs font-semibold tracking-widest text-gold-500 uppercase">Fixed Price</span>
                          <VerifiedBadge collectionName={l.name} verifiedBy={l.verifiedBy} />
                        </div>
                        <h3 className="text-white font-medium text-sm mb-1 line-clamp-2">{l.name}</h3>
                        <p className="text-gray-500 text-xs mb-3">{l.subtitle}</p>
                      </div>
                      <div>
                        <p className="text-gray-500 text-xs font-medium tracking-wider mb-1">Price</p>
                        <p className="text-white font-serif text-xl">
                          {l.currency === 'SOL' ? `◎ ${l.price.toLocaleString()}` : `$${l.price.toLocaleString()}`}
                        </p>
                        <p className="text-gold-500 text-xs mt-1">{l.currency}</p>
                      </div>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

export function HomeTCGSection() {
  const [onePiece, setOnePiece] = useState<MEListing[]>([]);
  const [pokemon, setPokemon] = useState<MEListing[]>([]);

  useEffect(() => {
    // Fetch top One Piece cards
    fetch('/api/me-listings?ccCategory=One Piece&sort=price-desc&perPage=8')
      .then(r => r.json())
      .then(data => setOnePiece(data.listings || []))
      .catch(() => {});

    // Fetch top Pokemon cards
    fetch('/api/me-listings?ccCategory=Pokemon&sort=price-desc&perPage=10')
      .then(r => r.json())
      .then(data => setPokemon(data.listings || []))
      .catch(() => {});
  }, []);

  return (
    <>
      <TCGCarousel title="One Piece TCG" emoji="🏴‍☠️" items={onePiece} />
      <TCGCarousel title="Pokémon TCG" emoji="⚡" items={pokemon} bg="bg-dark-800/30 border-t border-white/5" />
    </>
  );
}
