import { assets, auctions, listings, formatFullPrice } from "@/lib/data";
import AssetCard from "@/components/AssetCard";
import AuctionCard from "@/components/AuctionCard";
import VerifiedBadge from "@/components/VerifiedBadge";
import Link from "next/link";
import { HomeTCGSection } from "@/components/HomeTCGSection";

export default function Home() {
  // Featured BAXUS listing for hero
  const featuredBaxus = listings.find(l => l.source === 'baxus' && l.name?.toLowerCase().includes('pappy'));
  const heroListing = featuredBaxus || listings.find(l => l.source === 'baxus');

  return (
    <div>
      {/* Hero Section */}
      <section className="pt-24 pb-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          {heroListing && (
            <div className="relative rounded-lg overflow-hidden mb-16">
              {/* Hero Image */}
              <div className="relative h-[500px] md:h-[600px] overflow-hidden group bg-dark-800">
                <img
                  src={heroListing.image}
                  alt={heroListing.name}
                  className="w-full h-full object-contain group-hover:scale-105 transition duration-700"
                />
                {/* Dark overlay gradient */}
                <div className="absolute inset-0 bg-gradient-to-t from-dark-900 via-dark-900/40 to-transparent" />
                
                {/* Content overlay */}
                <div className="absolute bottom-0 left-0 right-0 p-8 md:p-12">
                  <div className="flex items-center gap-2 mb-3">
                    <p className="text-gold-500 text-xs font-semibold tracking-widest uppercase">Featured Listing</p>
                    <span className="text-xs px-2 py-0.5 bg-gold-500/20 text-gold-400 rounded font-medium">BAXUS Verified</span>
                  </div>
                  <h1 className="font-serif text-4xl md:text-5xl text-white mb-4 max-w-2xl leading-tight">
                    {heroListing.name}
                  </h1>
                  <p className="text-gray-300 text-base max-w-xl mb-2 leading-relaxed">
                    {heroListing.subtitle}
                  </p>
                  <p className="text-white font-serif text-3xl mb-6">{formatFullPrice(heroListing.price)}</p>
                  {heroListing.externalUrl ? (
                    <a
                      href={heroListing.externalUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-block px-8 py-3 bg-gold-500 hover:bg-gold-600 text-dark-900 rounded-lg font-semibold text-sm transition-colors duration-200"
                    >
                      Buy on BAXUS →
                    </a>
                  ) : (
                    <Link
                      href="/auctions/categories/spirits"
                      className="inline-block px-8 py-3 bg-gold-500 hover:bg-gold-600 text-dark-900 rounded-lg font-semibold text-sm transition-colors duration-200"
                    >
                      View Spirits →
                    </Link>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Category Grid */}
          <div className="mb-24">
            <div className="flex items-center justify-between mb-12">
              <div>
                <p className="text-gold-500 text-xs font-semibold tracking-widest uppercase mb-2">Browse</p>
                <h2 className="font-serif text-3xl md:text-4xl text-white">Collections</h2>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {[
                { name: "Digital Collectibles", emoji: "🎨", slug: "digital-art", href: "/digital-art" },
                { name: "Spirits", emoji: "🥃", slug: "spirits", href: "/auctions/categories/spirits" },
                { name: "TCG Cards", emoji: "🃏", slug: "tcg-cards", href: "/auctions/categories/tcg-cards" },
                { name: "Sports Cards", emoji: "⚽", slug: "sports-cards", href: "/auctions/categories/sports-cards" },
                { name: "Sealed Product", emoji: "📦", slug: "sealed", href: "/auctions/categories/sealed" },
                { name: "Merchandise", emoji: "🛍️", slug: "merchandise", href: "/auctions/categories/merchandise" },
                { name: "Phygitals", emoji: "🎴", slug: "phygitals", href: "/auctions/categories/phygitals" },
              ].map((cat, i) => (
                <Link key={i} href={cat.href} className="group">
                  <div className="bg-dark-800 rounded-lg border border-white/5 p-8 text-center card-hover h-full flex flex-col justify-center">
                    <div className="text-5xl mb-6">{cat.emoji}</div>
                    <h3 className="font-serif text-xl text-white mb-2">{cat.name}</h3>
                    <p className="text-gray-400 text-sm">Explore collection →</p>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Spirits Section - BAXUS Bottles */}
      <section className="bg-dark-800/30 border-t border-white/5 py-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <div className="flex items-center justify-between mb-12">
            <div>
              <p className="text-gold-500 text-xs font-semibold tracking-widest uppercase mb-2">Premium Selection</p>
              <h2 className="font-serif text-3xl md:text-4xl text-white">Fine Spirits 🥃</h2>
            </div>
            <Link href="/auctions/categories/spirits" className="text-gold-500 hover:text-gold-400 text-sm font-medium transition">
              View All →
            </Link>
          </div>
          <div className="overflow-x-auto pb-4 -mx-4 px-4">
            <div className="flex gap-6 snap-x">
              {listings.filter(l => l.category === "SPIRITS").slice(0, 6).map((l) => (
                <Link key={l.id} href={`/auctions?listing=${l.id}`} className="flex-shrink-0 w-80 snap-start group">
                  <div className="bg-dark-800 rounded-lg border border-white/5 overflow-hidden card-hover h-full flex flex-col">
                    <div className="aspect-square overflow-hidden bg-dark-900">
                      <img
                        src={l.image}
                        alt={l.name}
                        className="w-full h-full object-contain group-hover:scale-105 transition duration-500"
                      />
                    </div>
                    <div className="p-6 flex-1 flex flex-col justify-between">
                      <div>
                        <div className="flex items-start justify-between gap-2 mb-3">
                          <span className="text-xs font-semibold tracking-widest text-gold-500 uppercase">Fixed Price</span>
                          <VerifiedBadge collectionName={l.name} verifiedBy={l.verifiedBy} />
                        </div>
                        <h3 className="text-white font-medium text-base mb-1">{l.name}</h3>
                        <p className="text-gray-500 text-xs mb-1">{l.subtitle}</p>
                        <p className="text-gray-600 text-xs mb-4">{l.spirit_type}</p>
                      </div>
                      <div>
                        <p className="text-gray-500 text-xs font-medium tracking-wider mb-1">Price</p>
                        <p className="text-white font-serif text-2xl">{formatFullPrice(l.price)}</p>
                        <p className="text-gold-500 text-xs mt-1">{l.price.toLocaleString()} USD1</p>
                      </div>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* TCG Sections — fetched live from Magic Eden */}
      <HomeTCGSection />

      {/* Live Auctions Section */}
      <section className="bg-dark-800/30 border-t border-white/5 py-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <div className="flex items-center justify-between mb-12">
            <div>
              <p className="text-gold-500 text-xs font-semibold tracking-widest uppercase mb-2">Active Auctions</p>
              <h2 className="font-serif text-3xl md:text-4xl text-white">Live Now</h2>
            </div>
            <Link href="/auctions" className="text-gold-500 hover:text-gold-400 text-sm font-medium transition">
              View All Auctions →
            </Link>
          </div>
          <div className="text-center py-16">
            <p className="text-gray-400 text-lg font-serif">Coming Soon</p>
            <p className="text-gray-500 text-sm mt-2">Live auctions are being prepared. Stay tuned.</p>
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section className="border-t border-white/5 py-20 px-4 sm:px-6 lg:px-8 bg-dark-800/20">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <p className="text-gold-500 text-xs font-semibold tracking-widest uppercase mb-3">Process</p>
            <h2 className="font-serif text-3xl md:text-4xl text-white">How It Works</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-12 max-w-4xl mx-auto">
            {[
              {
                step: "01",
                title: "Browse & Discover",
                description: "Explore curated real-world assets tokenized as NFTs with verified provenance and authentication.",
              },
              {
                step: "02",
                title: "Bid or Buy",
                description: "Place bids on live auctions or purchase items at fixed prices using USD1 or USDC on Solana.",
              },
              {
                step: "03",
                title: "Own & Trade",
                description: "Take ownership of your asset NFT and trade it on secondary markets with full transparency.",
              },
            ].map((item, i) => (
              <div key={i} className="text-center">
                <div className="text-4xl font-serif text-gold-500 mb-4">{item.step}</div>
                <h3 className="font-serif text-xl text-white mb-3">{item.title}</h3>
                <p className="text-gray-400 text-sm leading-relaxed">{item.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
