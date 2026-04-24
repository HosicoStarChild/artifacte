"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import { ChevronDown } from "lucide-react";

import { cn } from "@/lib/utils";

type NavbarWalletButtonProps = {
  mobile?: boolean;
};

export function NavbarWalletButton({ mobile = false }: NavbarWalletButtonProps) {
  const { wallet, publicKey, connected, connecting, disconnecting, connect, disconnect } = useWallet();
  const { setVisible } = useWalletModal();
  const [menuOpen, setMenuOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const isMounted = useSyncExternalStore(
    () => () => undefined,
    () => true,
    () => false,
  );

  const resolvedWallet = isMounted ? wallet : null;
  const resolvedPublicKey = isMounted ? publicKey : null;
  const resolvedConnected = isMounted ? connected : false;
  const resolvedConnecting = isMounted ? connecting : false;
  const resolvedDisconnecting = isMounted ? disconnecting : false;

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

  const buttonState = resolvedConnecting
    ? "connecting"
    : resolvedDisconnecting
      ? "disconnecting"
      : resolvedConnected && resolvedPublicKey
        ? "connected"
        : resolvedWallet
          ? "has-wallet"
          : "no-wallet";

  const label = resolvedPublicKey
    ? `${resolvedPublicKey.toBase58().slice(0, 4)}...${resolvedPublicKey.toBase58().slice(-4)}`
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
    if (!resolvedPublicKey) return;

    try {
      await navigator.clipboard.writeText(resolvedPublicKey.toBase58());
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1200);
    } catch {
      setCopied(false);
    }
  };

  const walletIconStyle = resolvedWallet?.adapter.icon
    ? {
        backgroundImage: `url(${resolvedWallet.adapter.icon})`,
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
          "inline-flex items-center gap-2 border border-gold-300/35 bg-[linear-gradient(135deg,rgba(224,194,122,1)_0%,rgba(201,165,92,1)_52%,rgba(184,134,11,1)_100%)] text-dark-900 shadow-[0_10px_28px_rgba(201,165,92,0.22),inset_0_1px_0_rgba(255,255,255,0.18)] transition duration-200 hover:-translate-y-0.5 hover:shadow-[0_14px_32px_rgba(201,165,92,0.28),inset_0_1px_0_rgba(255,255,255,0.24)] disabled:cursor-not-allowed disabled:opacity-70",
          mobile
            ? "h-11 w-full justify-center rounded-xl px-4 text-sm font-semibold"
            : "h-10 rounded-lg px-5 text-xs font-semibold"
        )}
      >
        {walletIconStyle ? (
          <span
            aria-hidden="true"
            className="size-4.5 rounded-md bg-white/20 p-0.75"
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