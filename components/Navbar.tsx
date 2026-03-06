"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import { useState, useEffect } from "react";
import { useWallet } from "@solana/wallet-adapter-react";

const WalletMultiButton = dynamic(
  () => import("@solana/wallet-adapter-react-ui").then((m) => m.WalletMultiButton),
  { ssr: false }
);

const ADMIN_WALLET = "DDSpvAK8DbuAdEaaBHkfLieLPSJVCWWgquFAA3pvxXoX";

export default function Navbar() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const { publicKey, connected } = useWallet();
  const isAdmin = connected && publicKey?.toBase58() === ADMIN_WALLET;

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 10);
    };
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  return (
    <nav className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
      scrolled
        ? "bg-dark-900/70 backdrop-blur-md border-b border-white/8"
        : "bg-transparent border-b border-white/5"
    }`}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-20">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-2.5 flex-shrink-0">
            <div className="w-7 h-7 rounded-md bg-gold-500 flex items-center justify-center">
              <span className="text-dark-900 font-serif font-semibold text-sm">A</span>
            </div>
            <span className="font-serif text-lg font-bold text-blue-900 dark:text-blue-100 tracking-tight italic" style={{ fontFamily: "'Playfair Display', Georgia, serif", letterSpacing: "-0.02em", color: "#f5f5f0" }}>Artifacte</span>
          </Link>

          {/* Desktop Menu */}
          <div className="hidden md:flex items-center gap-12 flex-1 justify-center px-8">
            <Link href="/" className="text-sm text-gray-400 hover:text-white transition-colors duration-200">
              Home
            </Link>
            <Link href="/portfolio" className="text-sm text-gray-400 hover:text-white transition-colors duration-200">
              Portfolio
            </Link>
            <Link href="/auctions" className="text-sm text-gray-400 hover:text-white transition-colors duration-200">
              Auctions
            </Link>
            <Link href="/claw" className="text-sm text-gray-400 hover:text-white transition-colors duration-200">
              Claw
            </Link>
            <Link href="/agents" className="text-sm text-gray-400 hover:text-white transition-colors duration-200">
              Agents
            </Link>
            {connected && (
              <>
                <Link href="/list" className="text-sm text-gray-400 hover:text-white transition-colors duration-200">
                  List Item
                </Link>
                <Link href="/my-listings" className="text-sm text-gray-400 hover:text-white transition-colors duration-200">
                  My Listings
                </Link>
              </>
            )}
            <Link href="/apply" className="text-sm text-gray-400 hover:text-white transition-colors duration-200">
              Apply to List
            </Link>
            <Link href="/about" className="text-sm text-gray-400 hover:text-white transition-colors duration-200">
              About
            </Link>
          </div>

          {/* Admin + Wallet */}
          <div className="hidden md:flex items-center gap-4">
            {isAdmin && (
              <Link href="/admin" className="text-sm text-gold-500 hover:text-gold-400 transition-colors duration-200 font-medium">
                Admin
              </Link>
            )}
            <WalletMultiButton className="!bg-gold-500 hover:!bg-gold-600 !rounded-lg !h-10 !text-xs !font-semibold !px-5" />
          </div>

          {/* Mobile Menu Button */}
          <button className="md:hidden text-white p-2" onClick={() => setMenuOpen(!menuOpen)}>
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              {menuOpen ? (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              ) : (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              )}
            </svg>
          </button>
        </div>

        {/* Mobile Menu */}
        {menuOpen && (
          <div className="md:hidden bg-dark-900 border-t border-white/5 py-4 space-y-3">
            <Link href="/" className="block text-sm text-gray-400 hover:text-white px-4 py-2" onClick={() => setMenuOpen(false)}>
              Home
            </Link>
            <Link href="/portfolio" className="block text-sm text-gray-400 hover:text-white px-4 py-2" onClick={() => setMenuOpen(false)}>
              Portfolio
            </Link>
            <Link href="/auctions" className="block text-sm text-gray-400 hover:text-white px-4 py-2" onClick={() => setMenuOpen(false)}>
              Auctions
            </Link>
            <Link href="/claw" className="block text-sm text-gray-400 hover:text-white px-4 py-2" onClick={() => setMenuOpen(false)}>
              Claw
            </Link>
            <Link href="/agents" className="block text-sm text-gray-400 hover:text-white px-4 py-2" onClick={() => setMenuOpen(false)}>
              Agents
            </Link>
            {connected && (
              <>
                <Link href="/list" className="block text-sm text-gray-400 hover:text-white px-4 py-2" onClick={() => setMenuOpen(false)}>
                  List Item
                </Link>
                <Link href="/my-listings" className="block text-sm text-gray-400 hover:text-white px-4 py-2" onClick={() => setMenuOpen(false)}>
                  My Listings
                </Link>
              </>
            )}
            <Link href="/apply" className="block text-sm text-gray-400 hover:text-white px-4 py-2" onClick={() => setMenuOpen(false)}>
              Apply to List
            </Link>
            <Link href="/about" className="block text-sm text-gray-400 hover:text-white px-4 py-2" onClick={() => setMenuOpen(false)}>
              About
            </Link>
            {isAdmin && (
              <Link href="/admin" className="block text-sm text-gold-500 hover:text-gold-400 font-medium px-4 py-2" onClick={() => setMenuOpen(false)}>
                Admin
              </Link>
            )}
            <div className="px-4 py-2">
              <WalletMultiButton className="!bg-gold-500 hover:!bg-gold-600 !rounded-lg !h-10 !text-xs !font-semibold" />
            </div>
          </div>
        )}
      </div>
    </nav>
  );
}
