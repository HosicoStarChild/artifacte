import Link from "next/link";

export default function AboutPage() {
  return (
    <div className="pt-24 pb-20 min-h-screen">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">

        {/* Hero */}
        <div className="max-w-3xl mb-6">
          <p className="text-gold-400 text-xs font-bold tracking-[0.2em] uppercase mb-4">Overview</p>
          <h1 className="font-serif text-4xl md:text-5xl text-white mb-6 leading-tight">
            Curating the Future of Asset Ownership
          </h1>
          <p className="text-gray-400 text-lg leading-relaxed">
            A curated auction platform where real-world assets are tokenized as NFTs and traded with full transparency, enabling secure ownership, verified provenance, and global market access.
          </p>
        </div>

        {/* Curated Real-World Assets */}
        <section className="mb-20 mt-16">
          <p className="text-gold-400 text-xs font-bold tracking-[0.2em] uppercase mb-3">collection</p>
          <h2 className="font-serif text-3xl text-white mb-4">Curated Real-World Assets</h2>
          <p className="text-gray-400 text-sm mb-10 max-w-2xl">
            Explore a curated selection of real-world assets, tokenized as NFTs and presented through transparent, on-chain auctions.
          </p>

          {/* Auction Cards Row */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5 mb-8">
            {[
              { name: "Oakwood Cabinet (1960s)", bid: "390 USD1", time: "1d 12h", img: "https://images.unsplash.com/photo-1555041469-a586c61ea9bc?w=600" },
              { name: "Hand Crafted Storage (1954)", bid: "390 USD1", time: "1d 12h", img: "https://images.unsplash.com/photo-1506439773649-6e0eb8cfb237?w=600" },
              { name: "Pair of Molina Armless", bid: "390 USD1", time: "1d 12h", img: "https://images.unsplash.com/photo-1567538096630-e0c55bd6374c?w=600" },
            ].map((item, i) => (
              <div key={i} className="bg-navy-800 rounded-xl border border-white/5 overflow-hidden card-hover group">
                <div className="aspect-[4/3] overflow-hidden bg-navy-900">
                  <img src={item.img} alt={item.name} className="w-full h-full object-cover group-hover:scale-105 transition duration-500" />
                </div>
                <div className="p-4">
                  <h3 className="text-white font-medium text-sm">{item.name}</h3>
                  <div className="flex justify-between mt-2 text-xs">
                    <span className="text-gray-500">Current Bid: <span className="text-white">{item.bid}</span></span>
                    <span className="text-gray-500">Ends: <span className="text-gold-400">{item.time}</span></span>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <p className="text-gray-400 text-sm mb-10 max-w-2xl">
            Each asset is supported by verified documentation, detailed provenance records, and transparent on-chain ownership — ensuring authenticity, trust, and confidence throughout the auction process.
          </p>

          {/* Fixed Price Row */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-5">
            {[
              { name: "Edwin Dining Chair", price: "390 USD1", img: "https://images.unsplash.com/photo-1592078615290-033ee584e267?w=400" },
              { name: "Aria Dining Chair", price: "390 USD1", img: "https://images.unsplash.com/photo-1581539250439-c96689b516dd?w=400" },
              { name: "Sydney Armchair", price: "390 USD1", img: "https://images.unsplash.com/photo-1586023492125-27b2c045efd7?w=400" },
              { name: "Oxley Coffee Table", price: "390 USD1", img: "https://images.unsplash.com/photo-1532372320572-cda25653a26d?w=400" },
            ].map((item, i) => (
              <div key={i} className="bg-navy-800 rounded-xl border border-white/5 overflow-hidden card-hover group">
                <div className="aspect-square overflow-hidden bg-navy-900">
                  <img src={item.img} alt={item.name} className="w-full h-full object-cover group-hover:scale-105 transition duration-500" />
                </div>
                <div className="p-4">
                  <h3 className="text-white font-medium text-xs">{item.name}</h3>
                  <p className="text-gray-500 text-xs mt-1">Current Price: <span className="text-white">{item.price}</span></p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* About Us */}
        <section className="mb-20">
          <p className="text-gold-400 text-xs font-bold tracking-[0.2em] uppercase mb-3">about us</p>
          <h2 className="font-serif text-3xl text-white mb-4 max-w-3xl leading-tight">
            Curating Real-World Assets To Shape The Future Of Ownership Through Transparent And Trusted Auctions.
          </h2>
          <p className="text-gray-400 text-sm mb-10 max-w-2xl">
            We curate and auction real-world assets as NFTs, ensuring verified provenance, transparent auctions, and secure ownership worldwide.
          </p>

          <div className="bg-navy-800 rounded-xl border border-white/5 p-8 mb-8">
            <p className="text-gold-400 text-xs font-bold tracking-[0.2em] uppercase mb-3">values</p>
            <p className="text-gray-400 text-sm leading-relaxed max-w-2xl">
              We focus on trust and transparency in how every real-world asset is presented and auctioned. And we prioritize secure ownership and fair auctions to maintain trust across every asset.
            </p>
          </div>

          <h3 className="font-serif text-2xl text-white max-w-2xl leading-snug">
            Commitment to Trust, Transparency, Provenance, And Secure Ownership In Every Auction.
          </h3>
        </section>

        {/* Key Metrics */}
        <section className="mb-20">
          <p className="text-gold-400 text-xs font-bold tracking-[0.2em] uppercase mb-3">key metrics</p>
          <h2 className="font-serif text-3xl text-white mb-10">Platform at a Glance</h2>
          <div className="grid md:grid-cols-3 gap-6">
            {[
              { value: "$1B+", label: "Asset value listed", desc: "Representing the cumulative value of assets presented across curated listings." },
              { value: "$100M+", label: "Auction volume completed", desc: "Generated through confirmed transactions and successfully closed sales." },
              { value: "10,000+", label: "Active participants", desc: "Including collectors and asset owners engaged across the platform." },
            ].map((stat, i) => (
              <div key={i} className="bg-navy-800 rounded-xl border border-white/5 p-8 card-hover">
                <p className="text-gold-400 font-serif text-3xl font-bold mb-2">{stat.value}</p>
                <p className="text-white text-sm font-semibold mb-2">{stat.label}</p>
                <p className="text-gray-500 text-xs">{stat.desc}</p>
              </div>
            ))}
          </div>
        </section>

        {/* How to Submit */}
        <section className="mb-20">
          <h2 className="font-serif text-3xl text-white mb-4">How to Submit Real-World Asset NFTs for Auction</h2>
          <p className="text-gray-400 text-sm mb-10 max-w-2xl">
            List your real-world assets as NFTs in just a few simple steps — secure, transparent, and globally accessible.
          </p>

          <div className="relative max-w-xl">
            <div className="absolute left-[18px] top-2 bottom-2 w-px bg-white/10" />
            <div className="space-y-8">
              {[
                { icon: "💬", title: "Describe The Asset", desc: "Provide key details, ownership information, and provenance to represent your real-world asset as an NFT." },
                { icon: "📤", title: "Upload Proof & Documentation", desc: "Submit certificates, appraisals, photos, and any legal documentation for verification." },
                { icon: "📋", title: "Review And Submit", desc: "Review your submission details and confirm everything is accurate before submitting." },
                { icon: "🔗", title: "Asset Verification", desc: "Our team verifies authenticity, ownership, and documentation of your asset." },
                { icon: "🏛️", title: "Auction Goes Live", desc: "Once verified, your asset NFT is minted on Solana and the auction goes live." },
              ].map((step, i) => (
                <div key={i} className="flex items-start gap-5 relative">
                  <div className="w-9 h-9 rounded-lg bg-navy-800 border border-white/10 flex items-center justify-center flex-shrink-0 z-10 text-lg">
                    {step.icon}
                  </div>
                  <div>
                    <h3 className="text-white font-semibold text-base">{step.title}</h3>
                    <p className="text-gray-500 text-sm mt-1">{step.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <Link href="/submit" className="inline-block mt-10 px-6 py-3 bg-gold-500 hover:bg-gold-600 text-navy-900 rounded-lg font-semibold text-sm transition">
            Submit Now
          </Link>
        </section>
      </div>
    </div>
  );
}
