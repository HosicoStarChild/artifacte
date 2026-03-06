import Link from "next/link";

export default function NotFound() {
  return (
    <div className="min-h-screen bg-[#0a0e27] flex items-center justify-center px-4">
      <div className="text-center max-w-2xl mx-auto">
        {/* Error Code */}
        <div className="mb-8">
          <span className="inline-block text-7xl md:text-9xl font-serif font-bold bg-gradient-to-r from-[#d4af37] to-[#c9a55c] bg-clip-text text-transparent">
            404
          </span>
        </div>

        {/* Heading */}
        <h1 className="font-serif text-4xl md:text-5xl font-bold text-white mb-4">
          Page Not Found
        </h1>

        {/* Subheading */}
        <p className="text-gray-400 text-lg mb-8 leading-relaxed">
          The page you're looking for doesn't exist or has been moved. 
          Let's get you back to exploring authenticated real-world assets on Solana.
        </p>

        {/* Decorative Line */}
        <div className="h-px bg-gradient-to-r from-transparent via-[#d4af37]/30 to-transparent mb-8" />

        {/* Action Buttons */}
        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <Link
            href="/"
            className="inline-block px-8 py-3 rounded-lg bg-[#d4af37] hover:bg-[#c9a55c] text-[#0a0e27] font-semibold transition-colors duration-200"
          >
            Back to Home
          </Link>
          <Link
            href="/auctions"
            className="inline-block px-8 py-3 rounded-lg border border-[#d4af37]/30 text-[#d4af37] hover:bg-[#d4af37]/5 font-semibold transition-colors duration-200"
          >
            Browse Marketplace
          </Link>
        </div>

        {/* Additional Navigation */}
        <div className="mt-12 pt-8 border-t border-white/10">
          <p className="text-gray-500 text-sm mb-6">Or explore these popular sections:</p>
          <div className="flex flex-wrap justify-center gap-4">
            <Link href="/auctions" className="text-[#d4af37] hover:text-[#c9a55c] text-sm transition-colors">
              Auctions
            </Link>
            <span className="text-gray-700">•</span>
            <Link href="/digital-art" className="text-[#d4af37] hover:text-[#c9a55c] text-sm transition-colors">
              Digital Art
            </Link>
            <span className="text-gray-700">•</span>
            <Link href="/about" className="text-[#d4af37] hover:text-[#c9a55c] text-sm transition-colors">
              About
            </Link>
            <span className="text-gray-700">•</span>
            <Link href="/portfolio" className="text-[#d4af37] hover:text-[#c9a55c] text-sm transition-colors">
              Portfolio
            </Link>
          </div>
        </div>

        {/* Footer Message */}
        <div className="mt-16 text-gray-600 text-xs">
          <p>© Artifacte. Real-world asset tokenization on Solana.</p>
        </div>
      </div>
    </div>
  );
}
