"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useWallet } from "@solana/wallet-adapter-react";
import VerifiedBadge from "@/components/VerifiedBadge";
import { showToast } from "@/components/ToastContainer";
import { resolveListingDisplayPrice } from "@/lib/data";
import {
  calculateExternalMarketplaceFee,
  shouldApplyExternalMarketplaceFee,
} from "@/lib/external-purchase-fees";

const WalletMultiButton = dynamic(
  () => import("@solana/wallet-adapter-react-ui").then((m) => m.WalletMultiButton),
  { ssr: false }
);

interface MEListing {
  id: string;
  name: string;
  subtitle: string;
  price: number;
  image: string;
  currency: string;
  verifiedBy: string;
  ccCategory: string;
  source?: string;
  solPrice?: number | null;
  usdcPrice?: number | null;
  nftAddress?: string;
}

type TCGCarouselProps = {
  title: string;
  emoji: string;
  items: MEListing[];
  bg?: string;
  viewAllHref?: string;
  viewAllLabel?: string;
  showBuyButton?: boolean;
  connected?: boolean;
  buyingId?: string | null;
  purchasedIds?: Record<string, boolean>;
  onBuyNow?: (listing: MEListing) => void;
};

function getCardHref(listing: MEListing): string {
  if (listing.source === "artifacte" && listing.nftAddress) {
    return `/auctions/cards/${listing.nftAddress}`;
  }

  return `/auctions/cards/${listing.id}`;
}

function isInAppExternalCardListing(listing: MEListing): boolean {
  return listing.source === "collector-crypt" || listing.source === "phygitals";
}

function formatFeeDisplay(amount: number, currency: string): string {
  if (currency === "SOL") {
    return `◎ ${amount.toLocaleString(undefined, {
      minimumFractionDigits: amount < 1 ? 2 : 0,
      maximumFractionDigits: 4,
    })}`;
  }

  return `$${amount.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function formatListingQuote(amount: number, currency: string): string {
  const formattedAmount = amount.toLocaleString(
    undefined,
    currency === "SOL" ? { maximumFractionDigits: 4 } : undefined
  );

  return currency === "SOL"
    ? `◎ ${formattedAmount} SOL`
    : `$${formattedAmount} ${currency}`;
}

function TCGCarousel({
  title,
  emoji,
  items,
  bg,
  viewAllHref,
  viewAllLabel,
  showBuyButton,
  connected,
  buyingId,
  purchasedIds,
  onBuyNow,
}: TCGCarouselProps) {
  return (
    <section className={`${bg || ""} py-20 px-4 sm:px-6 lg:px-8`}>
      <div className="max-w-7xl mx-auto min-w-0">
        <div className="mb-12 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0">
            <p className="text-gold-500 text-xs font-semibold tracking-widest uppercase mb-2">Top Listings</p>
            <h2 className="font-serif text-3xl md:text-4xl text-white leading-tight break-words">{title} {emoji}</h2>
          </div>
          <Link href={viewAllHref || "/auctions/categories/tcg-cards"} className="self-start text-gold-500 hover:text-gold-400 text-sm font-medium transition sm:self-auto">
            {viewAllLabel || "View All TCG"} →
          </Link>
        </div>
        {items.length === 0 ? (
          <div className="overflow-x-auto overscroll-x-contain pb-4">
            <div className="flex gap-6">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="flex-shrink-0 w-72 bg-dark-800 rounded-lg border border-white/5 overflow-hidden animate-pulse">
                  <div className="aspect-square bg-dark-700" />
                  <div className="p-5 space-y-3">
                    <div className="h-3 bg-dark-700 rounded w-20" />
                    <div className="h-4 bg-dark-700 rounded w-48" />
                    <div className="h-3 bg-dark-700 rounded w-32" />
                    <div className="h-6 bg-dark-700 rounded w-24 mt-4" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="overflow-x-auto overscroll-x-contain pb-4">
            <div className="flex gap-6 snap-x">
              {items.map((listing) => {
                const displayPrice = resolveListingDisplayPrice(listing);
                const primaryAmount = displayPrice.currency === "SOL"
                  ? displayPrice.amount.toLocaleString(undefined, { maximumFractionDigits: 4 })
                  : displayPrice.amount.toLocaleString();
                const cardHref = getCardHref(listing);
                const canBuyHere = showBuyButton && isInAppExternalCardListing(listing) && Boolean(listing.nftAddress);
                const showExternalFeeNote = canBuyHere && shouldApplyExternalMarketplaceFee({ source: listing.source });
                const externalFee = showExternalFeeNote
                  ? calculateExternalMarketplaceFee(displayPrice.amount)
                  : 0;
                const isPurchased = Boolean(purchasedIds?.[listing.id]);

                return (
                  <div key={listing.id} className="flex-shrink-0 w-72 snap-start">
                    <div className="bg-dark-800 rounded-lg border border-white/5 overflow-hidden card-hover h-full flex flex-col group">
                      <Link href={cardHref} className="flex-1 flex flex-col">
                        <div className="aspect-square overflow-hidden bg-dark-900">
                          <img
                            src={listing.image}
                            alt={listing.name}
                            className="w-full h-full object-contain p-2 group-hover:scale-105 transition duration-500"
                          />
                        </div>
                        <div className="p-5 flex-1 flex flex-col justify-between">
                          <div>
                            <div className="flex items-start justify-between gap-2 mb-2">
                              <span className="text-xs font-semibold tracking-widest text-gold-500 uppercase">Fixed Price</span>
                              <VerifiedBadge collectionName={listing.name} verifiedBy={listing.verifiedBy} />
                            </div>
                            <h3 className="text-white font-medium text-sm mb-1 line-clamp-2">{listing.name}</h3>
                            <p className="text-gray-500 text-xs mb-3">{listing.subtitle}</p>
                          </div>
                          <div>
                            <p className="text-gray-500 text-xs font-medium tracking-wider mb-1">Price</p>
                            <p className="text-white font-serif text-xl">
                              {displayPrice.currency === "SOL" ? `◎ ${primaryAmount}` : `$${primaryAmount}`}
                            </p>
                            <p className="text-gold-500 text-xs mt-1">{displayPrice.currency}</p>
                            {showExternalFeeNote && (
                              <p className="text-amber-300 text-xs mt-2">
                                + {formatFeeDisplay(externalFee, displayPrice.currency)} Artifacte fee at checkout
                              </p>
                            )}
                          </div>
                        </div>
                      </Link>
                      {showBuyButton && (
                        <div className="px-5 pb-5">
                          {isPurchased ? (
                            <button
                              disabled
                              className="w-full px-4 py-2.5 bg-gray-600/50 cursor-not-allowed text-gray-400 rounded-lg text-sm font-semibold"
                            >
                              Purchased
                            </button>
                          ) : canBuyHere ? (
                            connected ? (
                              <button
                                onClick={() => onBuyNow?.(listing)}
                                disabled={buyingId === listing.id}
                                className="w-full px-4 py-2.5 bg-gold-500 hover:bg-gold-600 disabled:opacity-50 text-dark-900 rounded-lg text-sm font-semibold transition-colors duration-200"
                              >
                                {buyingId === listing.id ? "Processing..." : "Buy Now"}
                              </button>
                            ) : (
                              <WalletMultiButton className="w-full !bg-gold-500 hover:!bg-gold-600 !text-dark-900 !rounded-lg !text-sm !font-semibold !h-10 !justify-center" />
                            )
                          ) : (
                            <Link
                              href={cardHref}
                              className="w-full px-4 py-2.5 bg-gold-500 hover:bg-gold-600 text-dark-900 rounded-lg text-sm font-semibold transition-colors duration-200 text-center block"
                            >
                              View Details
                            </Link>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

export function HomeTCGSection() {
  const { publicKey, sendTransaction, signTransaction, connected, wallet } = useWallet();
  const [onePiece, setOnePiece] = useState<MEListing[]>([]);
  const [pokemon, setPokemon] = useState<MEListing[]>([]);
  const [sealed, setSealed] = useState<MEListing[]>([]);
  const [buyingId, setBuyingId] = useState<string | null>(null);
  const [purchasedIds, setPurchasedIds] = useState<Record<string, boolean>>({});

  const markPurchased = (listingId: string) => {
    setPurchasedIds((prev) => ({ ...prev, [listingId]: true }));
  };

  const handleBuyNow = async (listing: MEListing) => {
    if (!connected || !publicKey) {
      showToast.error("Please connect your wallet first");
      return;
    }

    const mintAddr = listing.nftAddress;
    const listingDisplayPrice = resolveListingDisplayPrice(listing);
    if (!mintAddr) {
      showToast.error("NFT mint address not available");
      return;
    }

    setBuyingId(listing.id);

    try {
      if (listing.source === "phygitals") {
        if (!signTransaction) throw new Error("Wallet does not support signing");

        const { executeTensorBuy } = await import("@/lib/tensor-buy-client");
        const result = await executeTensorBuy(
          mintAddr,
          publicKey.toBase58(),
          signTransaction,
          showToast.info,
          sendTransaction ?? undefined,
          wallet?.adapter?.name,
          { source: listing.source }
        );

        if (result.confirmed) {
          showToast.success(`✅ Card purchased for ${formatListingQuote(listingDisplayPrice.amount, listingDisplayPrice.currency)}!`);
        } else {
          showToast.info("Transaction sent but not confirmed yet. Check Solscan.");
        }

        markPurchased(listing.id);
        return;
      }

      showToast.info("Building transaction...");

      const buildRes = await fetch("/api/me-buy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mint: mintAddr,
          buyer: publicKey.toBase58(),
          source: listing.source,
        }),
      });

      if (!buildRes.ok) {
        const errData = await buildRes.json().catch(() => ({ error: "Failed to build transaction" }));
        throw new Error(errData.error || "Failed to build transaction");
      }

      const {
        v0Tx,
        v0TxSigned,
        legacyTx,
        price: mePrice,
        platformFee,
        platformFeeCurrency,
      } = await buildRes.json();

      if (!signTransaction) throw new Error("Wallet does not support signing");

      const feeDisplay = platformFee
        ? ` + ${platformFee.toFixed(platformFeeCurrency === "SOL" ? 4 : 2)} ${platformFeeCurrency} fee`
        : "";
      showToast.info(`💳 Confirm purchase — ${formatListingQuote(listingDisplayPrice.amount, listingDisplayPrice.currency)}${feeDisplay}`);

      const { Transaction, VersionedTransaction } = await import("@solana/web3.js");

      const bytesToBase64 = (bytes: Uint8Array): string => {
        let binary = "";
        const chunkSize = 0x8000;

        for (let i = 0; i < bytes.length; i += chunkSize) {
          const chunk = bytes.subarray(i, i + chunkSize);

          for (let j = 0; j < chunk.length; j++) {
            binary += String.fromCharCode(chunk[j]);
          }
        }

        return btoa(binary);
      };

      const sendViaProxy = async (rawTxBytes: Uint8Array): Promise<string> => {
        const res = await fetch("/api/rpc", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            jsonrpc: "2.0",
            id: 1,
            method: "sendTransaction",
            params: [bytesToBase64(rawTxBytes), { skipPreflight: true, encoding: "base64", maxRetries: 3 }],
          }),
        });

        const data = await res.json();
        if (data.error) throw new Error(data.error.message || JSON.stringify(data.error));
        return data.result;
      };

      const preSim = async (b64Tx: string) => {
        try {
          await fetch("/api/rpc", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              jsonrpc: "2.0",
              id: 1,
              method: "simulateTransaction",
              params: [b64Tx, { sigVerify: false, encoding: "base64", commitment: "processed" }],
            }),
          });
        } catch {}
      };

      let sig = "";

      if (v0TxSigned && v0Tx) {
        await preSim(v0TxSigned);
        const signedBytes = Uint8Array.from(atob(v0TxSigned), (char) => char.charCodeAt(0));
        const notaryTx = VersionedTransaction.deserialize(signedBytes);
        const signed = await signTransaction(notaryTx as any);
        sig = await sendViaProxy((signed as any).serialize());
      } else if (v0Tx) {
        await preSim(v0Tx);
        const txBytes = Uint8Array.from(atob(v0Tx), (char) => char.charCodeAt(0));
        const versionedTx = VersionedTransaction.deserialize(txBytes);
        const signed = await signTransaction(versionedTx as any);
        sig = await sendViaProxy((signed as any).serialize());
      } else if (legacyTx) {
        const txBytes = Uint8Array.from(atob(legacyTx), (char) => char.charCodeAt(0));
        const tx = Transaction.from(txBytes);
        const signed = await signTransaction(tx);
        sig = await sendViaProxy(signed.serialize());
      } else {
        throw new Error("No transaction returned from API");
      }

      let confirmed = false;
      for (let i = 0; i < 20; i++) {
        await new Promise((resolve) => setTimeout(resolve, 3000));
        const statusRes = await fetch("/api/rpc", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "getSignatureStatuses", params: [[sig]] }),
        });

        if (statusRes.status === 429) continue;

        const statusData = await statusRes.json();
        const status = statusData.result?.value?.[0];
        if (status?.confirmationStatus === "confirmed" || status?.confirmationStatus === "finalized") {
          if (status.err) throw new Error("Transaction failed on-chain");
          confirmed = true;
          break;
        }
      }

      if (confirmed) {
        showToast.success(`✅ Card purchased! TX: ${sig.slice(0, 16)}...`);
      } else {
        showToast.info(`TX sent: ${sig.slice(0, 8)}... — check your wallet`);
      }

      markPurchased(listing.id);
    } catch (err: any) {
      const message = err.message || "Transaction failed";
      const lowerMessage = message.toLowerCase();

      if (
        lowerMessage.includes("user rejected") ||
        lowerMessage.includes("rejected the request") ||
        lowerMessage.includes("declined") ||
        lowerMessage.includes("cancelled") ||
        lowerMessage.includes("canceled")
      ) {
        showToast.error("Transaction rejected by user");
      } else if (lowerMessage.includes("insufficient")) {
        showToast.error(`Insufficient balance. Required: ${formatListingQuote(listingDisplayPrice.amount, listingDisplayPrice.currency)}`);
      } else {
        showToast.error(`Error: ${message.slice(0, 80)}`);
      }
    } finally {
      setBuyingId(null);
    }
  };

  useEffect(() => {
    fetch("/api/me-listings?category=TCG_CARDS&ccCategory=One Piece&sort=price-desc&perPage=8")
      .then((r) => r.json())
      .then((data) => setOnePiece(data.listings || []))
      .catch(() => {});

    fetch("/api/me-listings?category=TCG_CARDS&ccCategory=Pokemon&sort=price-desc&perPage=10")
      .then((r) => r.json())
      .then((data) => setPokemon(data.listings || []))
      .catch(() => {});

    fetch("/api/me-listings?category=SEALED&sort=price-desc&perPage=10")
      .then((r) => r.json())
      .then((data) => setSealed(data.listings || []))
      .catch(() => {});
  }, []);

  return (
    <>
      <section className="px-4 sm:px-6 lg:px-8 pt-6">
        <div className="max-w-7xl mx-auto rounded-xl border border-amber-500/20 bg-amber-500/5 px-4 py-3 text-sm text-amber-100">
          External NFT purchases made through Artifacte include a 2% fee. Artifacte collection items are exempt.
        </div>
      </section>
      <TCGCarousel
        title="One Piece TCG"
        emoji="🏴‍☠️"
        items={onePiece}
        viewAllHref="/auctions/categories/tcg-cards?ccCategory=One+Piece"
        viewAllLabel="View All One Piece"
        showBuyButton
        connected={connected}
        buyingId={buyingId}
        purchasedIds={purchasedIds}
        onBuyNow={handleBuyNow}
      />
      <TCGCarousel
        title="Pokémon TCG"
        emoji="⚡"
        items={pokemon}
        bg="bg-dark-800/30 border-t border-white/5"
        viewAllHref="/auctions/categories/tcg-cards?ccCategory=Pokemon"
        viewAllLabel="View All Pokémon"
        showBuyButton
        connected={connected}
        buyingId={buyingId}
        purchasedIds={purchasedIds}
        onBuyNow={handleBuyNow}
      />
      <TCGCarousel title="Sealed Product" emoji="📦" items={sealed} viewAllHref="/auctions/categories/sealed" viewAllLabel="View All Sealed" />
    </>
  );
}
