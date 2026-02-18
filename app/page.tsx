import { assets, auctions, listings, formatFullPrice } from "@/lib/data";
import AssetCard from "@/components/AssetCard";
import AuctionCard from "@/components/AuctionCard";
import Link from "next/link";

export default function Home() {
  return (
    <div className="pt-20">
      {/* Live Auctions */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-16">
        <div className="flex items-center justify-between mb-8">
          <h2 className="font-serif text-3xl text-white">Live Auctions</h2>
          <Link href="/auctions" className="text-gold-400 text-sm hover:text-gold-500 transition">
            View All →
          </Link>
        </div>
        <div className="flex gap-5 overflow-x-auto pb-4 -mx-4 px-4 snap-x">
          {auctions.map((a) => (
            <AuctionCard key={a.id} auction={a} />
          ))}
        </div>
      </section>

      {/* Recent Listings */}
      <section id="listings" className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-20">
        <h2 className="font-serif text-3xl text-white mb-8">Recent RWA Listings</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {listings.map((l) => (
            <div key={l.id} className="bg-navy-800 rounded-xl border border-white/5 p-5 card-hover">
              <div className="flex items-start gap-4">
                <div className="w-16 h-16 rounded-lg overflow-hidden flex-shrink-0">
                  <img src={l.image} alt={l.name} className="w-full h-full object-cover" />
                </div>
                <div>
                  <h3 className="text-white font-medium text-sm">{l.name}</h3>
                  <p className="text-gray-500 text-xs mb-2">{l.subtitle}</p>
                  <p className="text-white font-semibold">{formatFullPrice(l.price)}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
