export default function Footer() {
  return (
    <footer className="border-t border-white/5 bg-navy-900 py-12">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col md:flex-row justify-between items-center gap-4">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded bg-gradient-to-br from-gold-400 to-gold-600 flex items-center justify-center">
              <span className="text-navy-900 font-bold text-xs">A</span>
            </div>
            <span className="font-serif text-lg text-white">Artifacte</span>
          </div>
          <p className="text-sm text-gray-500">
            Institutional-grade RWA tokenization on Solana • Built for Solana Graveyard Hackathon 2026
          </p>
          <div className="flex gap-6 text-sm text-gray-500">
            <span>Devnet</span>
            <a href="https://github.com" className="hover:text-white transition">GitHub</a>
          </div>
        </div>
      </div>
    </footer>
  );
}
