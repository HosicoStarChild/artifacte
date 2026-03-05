export default function Footer() {
  return (
    <footer className="border-t border-white/5 bg-dark-900 py-16">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-12 pb-12 border-b border-white/5">
          {/* Brand */}
          <div>
            <div className="flex items-center gap-2 mb-4">
              <div className="w-6 h-6 rounded-md bg-gold-500 flex items-center justify-center">
                <span className="text-dark-900 font-serif font-semibold text-xs">A</span>
              </div>
              <span className="font-serif text-lg text-white">Artifacte</span>
            </div>
            <p className="text-xs text-gray-500 leading-relaxed max-w-sm">
              A premium auction platform for real-world assets tokenized on Solana. Discover, bid, and own authenticated pieces with verified provenance.
            </p>
          </div>

          {/* Links */}
          <div className="flex gap-12">
            <div>
              <p className="text-xs font-semibold text-white tracking-widest uppercase mb-4">Platform</p>
              <ul className="space-y-2 text-sm text-gray-500">
                <li><a href="/auctions" className="hover:text-white transition">Auctions</a></li>
                <li><a href="/about" className="hover:text-white transition">About</a></li>
                <li><a href="/agents" className="hover:text-white transition">Agents</a></li>
              </ul>
            </div>
            <div>
              <p className="text-xs font-semibold text-white tracking-widest uppercase mb-4">Explore</p>
              <ul className="space-y-2 text-sm text-gray-500">
                <li><a href="/digital-art" className="hover:text-white transition">Digital Art</a></li>
                <li><a href="/apply" className="hover:text-white transition">Apply to List</a></li>
                <li><a href="https://github.com" className="hover:text-white transition">GitHub</a></li>
              </ul>
            </div>
          </div>

          {/* Status */}
          <div className="flex flex-col items-start md:items-end">
            <p className="text-xs font-semibold text-white tracking-widest uppercase mb-4">Status</p>
            <p className="text-xs text-gray-500 mb-1">Solana Devnet</p>
            <p className="text-xs text-gray-500">Graveyard Hackathon 2026</p>
          </div>
        </div>

        {/* Bottom */}
        <div className="pt-8 flex flex-col md:flex-row justify-between items-center gap-4">
          <p className="text-xs text-gray-600">© 2026 Artifacte. All rights reserved.</p>
          <p className="text-xs text-gray-600">Institutional-grade RWA tokenization</p>
        </div>
      </div>
    </footer>
  );
}
