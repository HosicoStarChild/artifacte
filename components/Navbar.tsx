"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import { useState } from "react";

const WalletMultiButton = dynamic(
  () => import("@solana/wallet-adapter-react-ui").then((m) => m.WalletMultiButton),
  { ssr: false }
);

export default function Navbar() {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 bg-navy-900/80 backdrop-blur-xl border-b border-white/5">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          <Link href="/" className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-gold-400 to-gold-600 flex items-center justify-center">
              <span className="text-navy-900 font-bold text-sm">A</span>
            </div>
            <span className="font-serif text-xl font-semibold text-white tracking-wide">Artifacte</span>
          </Link>

          <div className="hidden md:flex items-center gap-8">
            <Link href="/" className="text-sm text-gray-300 hover:text-white transition">Home</Link>
            <Link href="/portfolio" className="text-sm text-gray-300 hover:text-white transition">Portfolio</Link>
            <Link href="/auctions" className="text-sm text-gray-300 hover:text-white transition">Auctions</Link>
            <Link href="/digital-art" className="text-sm text-gray-300 hover:text-white transition">Digital Art</Link>
            <Link href="/submit" className="text-sm text-gray-300 hover:text-white transition">Submit</Link>
            <Link href="/about" className="text-sm text-gray-300 hover:text-white transition">About</Link>
            <WalletMultiButton className="!bg-gold-500 hover:!bg-gold-600 !rounded-lg !h-9 !text-sm !font-medium" />
          </div>

          <button className="md:hidden text-white" onClick={() => setMenuOpen(!menuOpen)}>
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              {menuOpen ? (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              ) : (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              )}
            </svg>
          </button>
        </div>

        {menuOpen && (
          <div className="md:hidden pb-4 space-y-3">
            <Link href="/" className="block text-sm text-gray-300 hover:text-white" onClick={() => setMenuOpen(false)}>Home</Link>
            <Link href="/portfolio" className="block text-sm text-gray-300 hover:text-white" onClick={() => setMenuOpen(false)}>Portfolio</Link>
            <Link href="/auctions" className="block text-sm text-gray-300 hover:text-white" onClick={() => setMenuOpen(false)}>Auctions</Link>
            <Link href="/digital-art" className="block text-sm text-gray-300 hover:text-white" onClick={() => setMenuOpen(false)}>Digital Art</Link>
            <Link href="/submit" className="block text-sm text-gray-300 hover:text-white" onClick={() => setMenuOpen(false)}>Submit</Link>
            <Link href="/about" className="block text-sm text-gray-300 hover:text-white" onClick={() => setMenuOpen(false)}>About</Link>
            <WalletMultiButton className="!bg-gold-500 hover:!bg-gold-600 !rounded-lg !h-9 !text-sm" />
          </div>
        )}
      </div>
    </nav>
  );
}
