"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { HomeTCGCarousel } from "@/components/home/HomeTCGCarousel";
import { showToast } from "@/components/ToastContainer";
import { useWalletCapabilities } from "@/hooks/useWalletCapabilities";
import {
  getTransactionErrorMessage,
  isTransactionRequestRejected,
  TRANSACTION_REQUEST_REJECTED_MESSAGE,
} from "@/lib/client/transaction-errors";
import { resolveListingDisplayPrice } from "@/lib/data";
import { fetchHomeTCGListings, formatHomeListingQuote, type HomeTCGListing } from "@/lib/home-tcg";
import { isTensorMarketplaceListing } from "@/lib/marketplace-routing";

export function HomeTCGSection() {
  const { publicKey, sendTransaction, signTransaction, connected, walletName } = useWalletCapabilities();
  const [buyingId, setBuyingId] = useState<string | null>(null);
  const [purchasedIds, setPurchasedIds] = useState<Record<string, boolean>>({});
  const { data: onePiece = [] } = useQuery({
    queryKey: ["me-listings", "home-tcg", "one-piece"],
    queryFn: () =>
      fetchHomeTCGListings("/api/me-listings?category=TCG_CARDS&ccCategory=One Piece&sort=price-desc&perPage=8"),
  });
  const { data: pokemon = [] } = useQuery({
    queryKey: ["me-listings", "home-tcg", "pokemon"],
    queryFn: () =>
      fetchHomeTCGListings("/api/me-listings?category=TCG_CARDS&ccCategory=Pokemon&sort=price-desc&perPage=10"),
  });
  const { data: sealed = [] } = useQuery({
    queryKey: ["me-listings", "home-tcg", "sealed"],
    queryFn: () => fetchHomeTCGListings("/api/me-listings?category=SEALED&sort=price-desc&perPage=10"),
  });

  const markPurchased = (listingId: string) => {
    setPurchasedIds((prev) => ({ ...prev, [listingId]: true }));
  };

  const handleBuyNow = async (listing: HomeTCGListing) => {
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
      if (isTensorMarketplaceListing(listing)) {
        if (!signTransaction) throw new Error("Wallet does not support signing");

        const { executeTensorBuy } = await import("@/lib/tensor-buy-client");
        const result = await executeTensorBuy(
          mintAddr,
          publicKey.toBase58(),
          signTransaction,
          showToast.info,
          sendTransaction ?? undefined,
          walletName ?? undefined,
          { source: listing.source },
          true
        );

        if (result.confirmed) {
          showToast.success(`✅ Card purchased for ${formatHomeListingQuote(result.totalPrice, result.currency)}!`);
        } else {
          showToast.info("Transaction sent but not confirmed yet. Check Solscan.");
        }

        markPurchased(listing.id);
        return;
      }

      if (!signTransaction) throw new Error("Wallet does not support signing");

      showToast.info("Building transaction...");

      const { executeMagicEdenBuy } = await import("@/lib/client/magic-eden-buy-client");
      const result = await executeMagicEdenBuy({
        mint: mintAddr,
        buyer: publicKey.toBase58(),
        source: listing.source,
        signTransaction,
        listingDisplayPrice,
        onStatus: showToast.info,
      });

      if (result.confirmed) {
        showToast.success(`✅ Card purchased! TX: ${result.sig.slice(0, 16)}...`);
      } else {
        showToast.info(`TX sent: ${result.sig.slice(0, 8)}... — check your wallet`);
      }

      markPurchased(listing.id);
    } catch (error) {
      const message = getTransactionErrorMessage(error);
      const lowerMessage = message.toLowerCase();

      if (isTransactionRequestRejected(error)) {
        showToast.error(TRANSACTION_REQUEST_REJECTED_MESSAGE);
      } else if (lowerMessage.includes("insufficient")) {
        showToast.error(`Insufficient balance. Required: ${formatHomeListingQuote(listingDisplayPrice.amount, listingDisplayPrice.currency)}`);
      } else {
        showToast.error(`Error: ${message.slice(0, 80)}`);
      }
    } finally {
      setBuyingId(null);
    }
  };

  return (
    <>
      <HomeTCGCarousel
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
      <HomeTCGCarousel
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
      <HomeTCGCarousel
        title="Sealed Product"
        emoji="📦"
        items={sealed}
        viewAllHref="/auctions/categories/sealed"
        viewAllLabel="View All Sealed"
        showBuyButton
        connected={connected}
        buyingId={buyingId}
        purchasedIds={purchasedIds}
        onBuyNow={handleBuyNow}
      />
    </>
  );
}
