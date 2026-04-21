"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useConnection } from "@solana/wallet-adapter-react";
import { PublicKey } from "@solana/web3.js";
import { getAssociatedTokenAddress } from "@solana/spl-token";
import { useWalletCapabilities } from "@/hooks/useWalletCapabilities";
import {
  getTransactionErrorMessage,
  isTransactionRequestRejected,
  TRANSACTION_REQUEST_REJECTED_MESSAGE,
} from "@/lib/client/transaction-errors";
import { resolveListingDisplayPrice, type Listing } from "@/lib/data";
import { isTensorMarketplaceListing } from "@/lib/marketplace-routing";
import { useAuctionProgram } from "@/hooks/useAuctionProgram";
import { showToast } from "@/components/ToastContainer";

const WalletMultiButton = dynamic(
  () => import("@solana/wallet-adapter-react-ui").then((module) => module.WalletMultiButton),
  { ssr: false }
);

const TOKENS: Record<"USD1" | "USDC", { mint: PublicKey; decimals: number; label: string }> = {
  USD1: { mint: new PublicKey("USD1ttGY1N17NEEHLmELoaybftRBUSErhqYiQzvEmuB"), decimals: 6, label: "USD1" },
  USDC: { mint: new PublicKey("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"), decimals: 6, label: "USDC" },
};

type CategoryListingPurchaseActionProps = {
  listing: Listing;
  useMeApi: boolean;
  isDigitalArt?: boolean;
  onPurchased?: (listingId: string, nftAddress?: string) => void;
};

function formatListingQuote(amount: number, currency: string): string {
  const formattedAmount = amount.toLocaleString(
    undefined,
    currency === "SOL" ? { maximumFractionDigits: 4 } : undefined
  );

  return currency === "SOL"
    ? `◎ ${formattedAmount} SOL`
    : `$${formattedAmount} ${currency}`;
}

export default function CategoryListingPurchaseAction({
  listing,
  useMeApi,
  isDigitalArt = false,
  onPurchased,
}: CategoryListingPurchaseActionProps) {
  const { publicKey, sendTransaction, signTransaction, connected, walletName } = useWalletCapabilities();
  const { connection } = useConnection();
  const auctionProgram = useAuctionProgram();
  const [buyingId, setBuyingId] = useState<string | null>(null);
  const currency: "USD1" | "USDC" = "USD1";

  async function handleBuyNow() {
    if (!connected || !publicKey) {
      showToast.error("Please connect your wallet first");
      return;
    }

    const listingId = listing.id;
    const nftMint = listing?.nftAddress || listing?.nftMint;
    const listingDisplayPrice = resolveListingDisplayPrice(listing);

    setBuyingId(listingId);

    try {
      let signature = "";

      if (listing?.source === "collector-crypt" || listing?.source === "phygitals" || listing?.nftAddress) {
        const mintAddr = listing?.nftAddress || nftMint;
        if (!mintAddr) {
          showToast.error("NFT mint address not available");
          setBuyingId(null);
          return;
        }

        if (!signTransaction) throw new Error("Wallet does not support signing");

        if (isTensorMarketplaceListing(listing)) {
          const { executeTensorBuy } = await import("@/lib/tensor-buy-client");
          const result = await executeTensorBuy(
            mintAddr,
            publicKey.toBase58(),
            signTransaction,
            showToast.info,
            sendTransaction ?? undefined,
            walletName ?? undefined,
            { source: listing?.source },
            true
          );

          if (result.confirmed) {
            showToast.success(`✅ Card purchased for ${formatListingQuote(result.totalPrice, result.currency)}!`);
          } else {
            showToast.info("Transaction sent but not confirmed yet. Check Solscan.");
          }

          onPurchased?.(listingId, mintAddr);
          setBuyingId(null);
          return;
        }

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

        onPurchased?.(listingId, mintAddr);
        setBuyingId(null);
        return;
      }

      if (nftMint && auctionProgram) {
        try {
          const nftMintPubkey = new PublicKey(nftMint);
          const token = TOKENS[currency];
          const buyerNftAccount = await getAssociatedTokenAddress(nftMintPubkey, publicKey);

          const AUCTION_PROGRAM_ID = new PublicKey("81s1tEx4MPdVvqS6X84Mok5K4N5fMbRLzcsT5eo2K8J3");
          const [coreListingPda] = PublicKey.findProgramAddressSync(
            [Buffer.from("core_listing"), nftMintPubkey.toBuffer()],
            AUCTION_PROGRAM_ID
          );
          const coreListingInfo = await connection.getAccountInfo(coreListingPda);

          if (coreListingInfo) {
            signature = await auctionProgram.buyNow(
              nftMintPubkey,
              nftMintPubkey,
              nftMintPubkey,
              buyerNftAccount,
              0,
              token.mint
            );
          } else {
            const [listingPda] = PublicKey.findProgramAddressSync(
              [Buffer.from("listing"), nftMintPubkey.toBuffer()],
              AUCTION_PROGRAM_ID
            );
            const listingInfo = await connection.getAccountInfo(listingPda);
            if (!listingInfo) throw new Error("On-chain listing not found");
            const sellerPubkey = new PublicKey(listingInfo.data.subarray(8, 40));

            const buyerPaymentAccount = await getAssociatedTokenAddress(token.mint, publicKey);
            const sellerPaymentAccount = await getAssociatedTokenAddress(token.mint, sellerPubkey);

            signature = await auctionProgram.buyNow(
              nftMintPubkey,
              sellerPaymentAccount,
              buyerPaymentAccount,
              buyerNftAccount,
              Math.round(listing.price * (10 ** token.decimals)),
              token.mint
            );
          }
        } catch (programError) {
          const programErrorMessage = programError instanceof Error ? programError.message : "unknown error";
          console.warn("AuctionProgram.buyNow failed, falling back to direct transfer:", programError);
          throw new Error(`On-chain purchase failed: ${programErrorMessage.slice(0, 50)}`);
        }
      } else {
        throw new Error("This item is not available for purchase");
      }

      showToast.success(`✓ Purchase successful! TX: ${signature.slice(0, 12)}...`);
      onPurchased?.(listingId, nftMint || listing?.nftAddress);
    } catch (error) {
      const message = getTransactionErrorMessage(error);
      const lowerMessage = message.toLowerCase();

      if (isTransactionRequestRejected(error)) {
        showToast.error(TRANSACTION_REQUEST_REJECTED_MESSAGE);
      } else if (lowerMessage.includes("insufficient")) {
        showToast.error(
          `Insufficient balance. Required: ${formatListingQuote(
            listingDisplayPrice?.amount ?? listing.price,
            listingDisplayPrice?.currency ?? (isDigitalArt ? "SOL" : currency)
          )}`
        );
      } else {
        showToast.error(`Error: ${message.slice(0, 80)}`);
      }
    } finally {
      setBuyingId(null);
    }
  }

  if (listing.externalUrl) {
    return (
      <a
        href={listing.externalUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="w-full px-4 py-2.5 bg-gold-500 hover:bg-gold-600 text-dark-900 rounded-lg text-sm font-semibold transition-colors duration-200 text-center block"
      >
        View Listing
      </a>
    );
  }

  if (listing.source === "artifacte" && listing.nftAddress) {
    return (
      <Link
        href={`/auctions/cards/${listing.nftAddress}`}
        className="w-full px-4 py-2.5 bg-gold-500 hover:bg-gold-600 text-dark-900 rounded-lg text-sm font-semibold transition-colors duration-200 text-center block"
      >
        View Details
      </Link>
    );
  }

  if ((listing.source === "phygitals" || listing.source === "collector-crypt") && listing.nftAddress) {
    if (connected) {
      return (
        <button
          onClick={handleBuyNow}
          disabled={buyingId === listing.id}
          className="w-full px-4 py-2.5 bg-gold-500 hover:bg-gold-600 disabled:opacity-50 text-dark-900 rounded-lg text-sm font-semibold transition-colors duration-200"
        >
          {buyingId === listing.id ? "Processing..." : "Buy Now"}
        </button>
      );
    }

    return (
      <WalletMultiButton className="w-full bg-gold-500! hover:bg-gold-600! text-dark-900! rounded-lg! text-sm! font-semibold! h-10! justify-center!" />
    );
  }

  if (useMeApi) {
    return (
      <button
        disabled
        className="w-full px-4 py-2.5 bg-gray-600/50 cursor-not-allowed text-gray-400 rounded-lg text-sm font-semibold"
      >
        Coming Soon
      </button>
    );
  }

  if (connected) {
    return (
      <button
        onClick={handleBuyNow}
        disabled={buyingId === listing.id}
        className="w-full px-4 py-2.5 bg-gold-500 hover:bg-gold-600 disabled:opacity-50 text-dark-900 rounded-lg text-sm font-semibold transition-colors duration-200"
      >
        {buyingId === listing.id ? "Processing..." : "Buy Now"}
      </button>
    );
  }

  return <WalletMultiButton className="w-full! bg-gold-500! hover:bg-gold-600! rounded-lg! h-10! text-sm! font-semibold!" />;
}