"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import { ChevronDown, MenuIcon } from "lucide-react";
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

type NavbarWalletButtonProps = {
  mobile?: boolean;
};

function NavbarWalletButton({ mobile = false }: NavbarWalletButtonProps) {
  const { wallet, publicKey, connected, connecting, disconnecting, connect, disconnect } = useWallet();
  const { setVisible } = useWalletModal();
  const [menuOpen, setMenuOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;

    const handlePointerDown = (event: MouseEvent | TouchEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    };

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("touchstart", handlePointerDown);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("touchstart", handlePointerDown);
    };
  }, [menuOpen]);

  const buttonState = connecting
    ? "connecting"
    : disconnecting
      ? "disconnecting"
      : connected && publicKey
        ? "connected"
        : wallet
          ? "has-wallet"
          : "no-wallet";

  const label = publicKey
    ? `${publicKey.toBase58().slice(0, 4)}...${publicKey.toBase58().slice(-4)}`
    : buttonState === "connecting"
      ? "Connecting..."
      : buttonState === "disconnecting"
        ? "Disconnecting..."
        : buttonState === "has-wallet"
          ? "Connect"
          : "Select Wallet";

  const handlePrimaryAction = () => {
    if (buttonState === "no-wallet") {
      setVisible(true);
      return;
    }

    if (buttonState === "has-wallet") {
      void connect().catch(() => undefined);
      return;
    }

    if (buttonState === "connected") {
      setMenuOpen((open) => !open);
    }
  };

  const handleCopyAddress = async () => {
    if (!publicKey) return;

    try {
      await navigator.clipboard.writeText(publicKey.toBase58());
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1200);
    } catch {
      setCopied(false);
    }
  };

  const walletIconStyle = wallet?.adapter.icon
    ? {
        backgroundImage: `url(${wallet.adapter.icon})`,
        backgroundPosition: "center",
        backgroundRepeat: "no-repeat",
        backgroundSize: "contain",
      }
    : undefined;

  return (
    <div ref={menuRef} className={cn("relative", mobile ? "w-full" : "shrink-0")}>
      <button
        type="button"
        onClick={handlePrimaryAction}
        disabled={buttonState === "connecting" || buttonState === "disconnecting"}
        aria-expanded={buttonState === "connected" ? menuOpen : undefined}
        aria-haspopup={buttonState === "connected" ? "menu" : undefined}
        className={cn(
          "inline-flex items-center gap-2 border border-gold-300/35 bg-[linear-gradient(135deg,_rgba(224,194,122,1)_0%,_rgba(201,165,92,1)_52%,_rgba(184,134,11,1)_100%)] text-dark-900 shadow-[0_10px_28px_rgba(201,165,92,0.22),inset_0_1px_0_rgba(255,255,255,0.18)] transition duration-200 hover:-translate-y-0.5 hover:shadow-[0_14px_32px_rgba(201,165,92,0.28),inset_0_1px_0_rgba(255,255,255,0.24)] disabled:cursor-not-allowed disabled:opacity-70",
          mobile
            ? "h-11 w-full justify-center rounded-xl px-4 text-sm font-semibold"
            : "h-10 rounded-lg px-5 text-xs font-semibold"
        )}
      >
        {walletIconStyle ? (
          <span
            aria-hidden="true"
            className="size-[18px] rounded-md bg-white/20 p-[3px]"
            style={walletIconStyle}
          />
        ) : null}
        <span>{label}</span>
        {buttonState === "connected" ? (
          <ChevronDown className={cn("size-3.5 transition-transform", menuOpen ? "rotate-180" : undefined)} />
        ) : null}
      </button>

      {buttonState === "connected" && menuOpen ? (
        <div
          role="menu"
          className={cn(
            "absolute top-full z-50 mt-3 overflow-hidden rounded-2xl border border-white/10 bg-dark-800/95 p-2 text-white shadow-[0_20px_50px_rgba(0,0,0,0.45)] backdrop-blur-xl",
            mobile ? "left-0 right-0" : "right-0 min-w-48"
          )}
        >
          <button
            type="button"
            role="menuitem"
            onClick={() => void handleCopyAddress()}
            className="flex w-full items-center rounded-xl px-3 py-2.5 text-left text-sm text-white transition-colors hover:bg-white/8"
          >
            {copied ? "Copied" : "Copy address"}
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setMenuOpen(false);
              setVisible(true);
            }}
            className="flex w-full items-center rounded-xl px-3 py-2.5 text-left text-sm text-white transition-colors hover:bg-white/8"
          >
            Change wallet
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setMenuOpen(false);
              void disconnect().catch(() => undefined);
            }}
            className="flex w-full items-center rounded-xl px-3 py-2.5 text-left text-sm text-red-200 transition-colors hover:bg-red-500/10 hover:text-red-100"
          >
            Disconnect
          </button>
        </div>
      ) : null}
    </div>
  );
}

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
          <Link href="/" className="flex items-center gap-2.5 shrink-0">
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
            <NavbarWalletButton />
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
                <NavbarWalletButton mobile />
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </nav>
  );
}
