import Link from "next/link";

export default function AboutPage() {
  return (
    <div className="pt-24 pb-20 min-h-screen">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">

        {/* Hero */}
        <div className="max-w-4xl mb-20">
          <p className="text-gold-500 text-xs font-semibold tracking-widest uppercase mb-6">About Us</p>
          <h1 className="font-serif text-5xl md:text-6xl text-white mb-8 leading-tight">
            Curating the Future of Asset Ownership
          </h1>
          <p className="text-gray-300 text-lg leading-relaxed">
            A premium auction platform where real-world assets are tokenized as NFTs and traded with full transparency. We enable secure ownership, verified provenance, and global market access for collectors and institutions.
          </p>
        </div>

        {/* Mission Section */}
        <section className="mb-20 pb-20 border-b border-white/5">
          <p className="text-gold-500 text-xs font-semibold tracking-widest uppercase mb-4">Our Mission</p>
          <h2 className="font-serif text-4xl md:text-5xl text-white mb-8 max-w-3xl leading-tight">
            Reshaping Ownership Through Tokenization
          </h2>
          <p className="text-gray-300 text-lg leading-relaxed max-w-3xl mb-8">
            Artifacte transforms the way the world buys, sells, and owns real-world assets. By leveraging blockchain technology and NFTs, we bring transparency, security, and global access to asset markets traditionally reserved for institutions.
          </p>
          <p className="text-gray-400 text-base leading-relaxed max-w-3xl">
            Every asset on our platform is verified, documented, and traceable. Every transaction is transparent and immutable. Every owner has secure, verifiable title to their asset.
          </p>
        </section>

        {/* How We Do It */}
        <section className="mb-20 pb-20 border-b border-white/5">
          <p className="text-gold-500 text-xs font-semibold tracking-widest uppercase mb-4">How We Work</p>
          <h2 className="font-serif text-3xl md:text-4xl text-white mb-12">Our Process</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-12">
            {[
              {
                num: "01",
                title: "Curate",
                desc: "We carefully select high-value real-world assets from established sources, ensuring authenticity and provenance.",
              },
              {
                num: "02",
                title: "Verify",
                desc: "Each asset undergoes rigorous verification including documentation, authentication, and on-chain registration.",
              },
              {
                num: "03",
                title: "Auction",
                desc: "Assets are presented through transparent, blockchain-based auctions accessible to collectors worldwide.",
              },
            ].map((item, i) => (
              <div key={i}>
                <div className="text-5xl font-serif text-gold-500 mb-4">{item.num}</div>
                <h3 className="font-serif text-2xl text-white mb-3">{item.title}</h3>
                <p className="text-gray-400 leading-relaxed">{item.desc}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Core Values */}
        <section className="mb-20 pb-20 border-b border-white/5">
          <p className="text-gold-500 text-xs font-semibold tracking-widest uppercase mb-4">Our Values</p>
          <h2 className="font-serif text-3xl md:text-4xl text-white mb-12">What We Stand For</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
            {[
              {
                icon: "🔐",
                title: "Trust & Transparency",
                desc: "Complete transparency in every transaction. Blockchain immutability ensures trust without intermediaries.",
              },
              {
                icon: "✓",
                title: "Verified Authenticity",
                desc: "Rigorous verification processes and on-chain documentation guarantee the authenticity of every asset.",
              },
              {
                icon: "🌍",
                title: "Global Access",
                desc: "Breaking down barriers to high-value asset ownership, enabling collectors worldwide to participate.",
              },
              {
                icon: "⚖️",
                title: "Fair Auctions",
                desc: "Open, competitive bidding platforms where price discovery is transparent and equitable for all participants.",
              },
            ].map((item, i) => (
              <div key={i} className="bg-dark-800 rounded-lg border border-white/5 p-8">
                <div className="text-3xl mb-4">{item.icon}</div>
                <h3 className="font-serif text-xl text-white mb-3">{item.title}</h3>
                <p className="text-gray-400 leading-relaxed">{item.desc}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Metrics */}
        <section className="mb-20">
          <p className="text-gold-500 text-xs font-semibold tracking-widest uppercase mb-4">By The Numbers</p>
          <h2 className="font-serif text-3xl md:text-4xl text-white mb-12">Platform Overview</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {[
              { value: "$1B+", label: "Asset Value", desc: "Cumulative value across curated listings and auctions." },
              { value: "$100M+", label: "Trading Volume", desc: "Completed transactions and successful auction closures." },
              { value: "10K+", label: "Active Collectors", desc: "Community members bidding and owning assets." },
            ].map((stat, i) => (
              <div key={i} className="bg-dark-800 rounded-lg border border-white/5 p-8 text-center">
                <p className="font-serif text-4xl text-gold-500 mb-3">{stat.value}</p>
                <p className="text-white font-serif text-lg mb-2">{stat.label}</p>
                <p className="text-gray-400 text-sm leading-relaxed">{stat.desc}</p>
              </div>
            ))}
          </div>
        </section>

        {/* How to Submit section removed — replaced by Apply to List flow */}
      </div>
    </div>
  );
}
