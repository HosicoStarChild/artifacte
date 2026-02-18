"use client";

import Link from "next/link";

const digitalArtPieces = [
  {
    id: "da1",
    name: "Ethereal Bloom",
    artist: "Luna Vasquez",
    price: 12500,
    usd1Price: function() { return this.price; },
    image: "https://images.unsplash.com/photo-1541961017774-22349e4a1262?w=800",
    description: "Mixed media on canvas, 48×60 inches",
  },
  {
    id: "da2",
    name: "Neon Genesis",
    artist: "Kai Tanaka",
    price: 8200,
    usd1Price: function() { return this.price; },
    image: "https://images.unsplash.com/photo-1578301978693-85fa9c0320b9?w=800",
    description: "Digital painting, 4K resolution, 1/1 edition",
  },
  {
    id: "da3",
    name: "Fractured Light",
    artist: "Amara Osei",
    price: 18000,
    usd1Price: function() { return this.price; },
    image: "https://images.unsplash.com/photo-1579783902614-a3fb3927b6a5?w=800",
    description: "Generative art, custom algorithm, signed print",
  },
  {
    id: "da4",
    name: "Eternal Light Sculpture",
    artist: "Diego Morales",
    price: 32500,
    usd1Price: function() { return this.price; },
    image: "https://images.unsplash.com/photo-1561214115-f2f134cc4912?w=800",
    description: "3D digital sculpture, AR-compatible NFT",
  },
  {
    id: "da5",
    name: "Chromatic Dreams",
    artist: "Yuki Sato",
    price: 5800,
    usd1Price: function() { return this.price; },
    image: "https://images.unsplash.com/photo-1547826039-bfc35e0f1ea8?w=800",
    description: "Abstract digital composition, 8K resolution",
  },
  {
    id: "da6",
    name: "Urban Decay Series #7",
    artist: "Marcus Webb",
    price: 14200,
    usd1Price: function() { return this.price; },
    image: "https://images.unsplash.com/photo-1549490349-8643362247b5?w=800",
    description: "Photography + digital manipulation, limited edition",
  },
  {
    id: "da7",
    name: "Quantum Veil",
    artist: "Priya Sharma",
    price: 22000,
    usd1Price: function() { return this.price; },
    image: "https://images.unsplash.com/photo-1604871000636-074fa5117945?w=800",
    description: "AI-assisted generative art, unique token",
  },
  {
    id: "da8",
    name: "Solar Flare",
    artist: "Elena Petrova",
    price: 9500,
    usd1Price: function() { return this.price; },
    image: "https://images.unsplash.com/photo-1482160549825-59d1b23cb208?w=800",
    description: "Digital oil painting, exhibition-quality print",
  },
];

export default function DigitalArtPage() {
  return (
    <div className="pt-24 pb-20">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <p className="text-gold-400 text-xs font-bold tracking-[0.2em] uppercase mb-2">
          Curated Collection
        </p>
        <h1 className="font-serif text-4xl text-white mb-2">Digital Art</h1>
        <p className="text-gray-400 text-sm mb-10 max-w-2xl">
          Museum-quality digital artworks tokenized as NFTs on Solana. Each piece is authenticated, 
          verified, and backed by provenance records on-chain.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {digitalArtPieces.map((piece) => (
            <div
              key={piece.id}
              className="bg-navy-800 rounded-xl border border-white/5 overflow-hidden card-hover group"
            >
              <div className="aspect-square overflow-hidden bg-navy-900">
                <img
                  src={piece.image}
                  alt={piece.name}
                  className="w-full h-full object-cover group-hover:scale-105 transition duration-500"
                />
              </div>
              <div className="p-5">
                <span className="text-[10px] font-bold tracking-widest text-purple-400 uppercase">
                  Digital Art
                </span>
                <h3 className="text-white font-medium mt-1">{piece.name}</h3>
                <p className="text-gray-500 text-xs mt-0.5">by {piece.artist}</p>
                <p className="text-gray-600 text-[10px] mt-1">{piece.description}</p>
                <div className="flex items-center justify-between mt-4">
                  <div>
                    <p className="text-gray-500 text-[10px] uppercase tracking-wider">Price</p>
                    <p className="text-white font-semibold">${piece.price.toLocaleString()}</p>
                    <p className="text-gold-400 text-[10px]">{piece.usd1Price.toLocaleString()} USD1</p>
                  </div>
                  <Link
                    href="/auctions"
                    className="px-4 py-2 bg-gold-500 hover:bg-gold-600 text-navy-900 rounded-lg text-xs font-medium transition"
                  >
                    View
                  </Link>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
