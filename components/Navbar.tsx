"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import { useState, useEffect } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { MenuIcon } from "lucide-react";
import { hasAdminAccess } from "@/lib/data";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";

const navigationLinks = [
  { href: "/", label: "Home" },
  { href: "/portfolio", label: "Portfolio" },
  { href: "/my-listings", label: "My Listings", requiresWallet: true },
  { href: "/list", label: "List Item", requiresWallet: true },
  { href: "/agents", label: "Agent Dashboard" },
  { href: "/apply", label: "Apply to List" },
  { href: "/about", label: "About" },
];

const WalletMultiButton = dynamic(
  () => import("@solana/wallet-adapter-react-ui").then((m) => m.WalletMultiButton),
  { ssr: false }
);

export default function Navbar() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const { publicKey, connected } = useWallet();
  const isAdmin = connected && hasAdminAccess(publicKey?.toBase58());
  const visibleNavigationLinks = navigationLinks.filter(
    (link) => !link.requiresWallet || connected
  );

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 10);
    };
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  return (
    <nav
      className={cn(
        "fixed top-0 left-0 right-0 z-50 border-b transition-all duration-300",
        scrolled
          ? "border-white/10 bg-dark-900/80 shadow-[0_18px_54px_rgba(0,0,0,0.24)] backdrop-blur-xl"
          : "border-white/5 bg-dark-900/20 backdrop-blur-md"
      )}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-20">
          <Link href="/" className="flex items-center gap-2.5 flex-shrink-0">
            <div className="w-7 h-7 rounded-md bg-gold-500 flex items-center justify-center">
              <span className="text-dark-900 font-serif font-semibold text-sm">A</span>
            </div>
            <span className="font-serif text-lg font-bold tracking-tight italic text-white">
              Artifacte
            </span>
          </Link>

          <div className="hidden md:flex items-center gap-12 flex-1 justify-center px-8">
            {visibleNavigationLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="text-sm text-gray-400 transition-colors duration-200 hover:text-white"
              >
                {link.label}
              </Link>
            ))}
          </div>

          <div className="hidden md:flex items-center gap-4">
            {isAdmin && (
              <Link
                href="/admin"
                className="rounded-full border border-gold-500/20 bg-gold-500/10 px-4 py-2 text-sm font-medium text-gold-500 transition-colors duration-200 hover:bg-gold-500/20"
              >
                Admin
              </Link>
            )}
            <WalletMultiButton className="!bg-gold-500 hover:!bg-gold-600 !rounded-lg !h-10 !text-xs !font-semibold !px-5" />
          </div>

          <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
            <SheetTrigger className="inline-flex items-center justify-center rounded-lg border border-white/10 bg-white/5 p-2 text-white transition-colors hover:bg-white/10 md:hidden">
              <MenuIcon className="size-5" />
              <span className="sr-only">Open menu</span>
            </SheetTrigger>
            <SheetContent
              side="right"
              className="w-[20rem] gap-0 border-l border-white/10 bg-dark-900/95 p-0 text-white backdrop-blur-xl"
            >
              <SheetHeader className="border-b border-white/10 pb-5">
                <SheetTitle className="font-serif text-white">Artifacte</SheetTitle>
                <SheetDescription className="text-gray-400">
                  Navigate the marketplace and manage your wallet.
                </SheetDescription>
              </SheetHeader>

              <div className="flex flex-1 flex-col gap-2 px-4 py-5">
                {visibleNavigationLinks.map((link) => (
                  <Link
                    key={link.href}
                    href={link.href}
                    className="rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white transition-colors duration-200 hover:bg-white/10"
                    onClick={() => setMobileMenuOpen(false)}
                  >
                    {link.label}
                  </Link>
                ))}
              </div>

              <Separator className="bg-white/10" />

              <div className="space-y-3 p-4">
                {isAdmin && (
                  <Link
                    href="/admin"
                    className="block rounded-xl border border-gold-500/20 bg-gold-500/10 px-4 py-3 text-sm font-medium text-gold-500 transition-colors duration-200 hover:bg-gold-500/20"
                    onClick={() => setMobileMenuOpen(false)}
                  >
                    Admin
                  </Link>
                )}
                <WalletMultiButton className="!h-11 !w-full !rounded-xl !bg-gold-500 !text-sm !font-semibold hover:!bg-gold-600" />
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </nav>
  );
}
