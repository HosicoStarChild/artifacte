"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useConnection } from "@solana/wallet-adapter-react";
import { PublicKey, Transaction } from "@solana/web3.js";
import { getAssociatedTokenAddress } from "@solana/spl-token";
import { useWalletCapabilities } from "@/hooks/useWalletCapabilities";
import {
  getTransactionErrorMessage,
  isTransactionRequestRejected,
  TRANSACTION_REQUEST_REJECTED_MESSAGE,
} from "@/lib/client/transaction-errors";
import { resolveListingDisplayPrice } from "@/lib/data";
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
  listing: any;
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

        if (listing?.source === "phygitals" || String(listingId).startsWith("phyg-")) {
          if (!signTransaction) throw new Error("Wallet does not support signing");

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
        const buildResponse = await fetch("/api/me-buy", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            mint: mintAddr,
            buyer: publicKey.toBase58(),
            source: listing?.source,
          }),
        });

        if (!buildResponse.ok) {
          const errorPayload = await buildResponse.json().catch(() => ({ error: "Failed to build transaction" }));
          throw new Error(errorPayload.error || "Failed to build transaction");
        }

        const {
          v0Tx,
          v0TxSigned,
          legacyTx,
          displayPrice,
          displayCurrency,
          platformFee,
          platformFeeCurrency,
        } = await buildResponse.json();

        if (!signTransaction) throw new Error("Wallet does not support signing");

        const toastCurrency = displayCurrency || listingDisplayPrice.currency || (isDigitalArt ? "SOL" : currency);
        const toastBaseAmount = displayPrice ?? listingDisplayPrice.amount ?? listing.price;
        const toastTotal = toastBaseAmount + ((platformFeeCurrency === toastCurrency && platformFee) ? platformFee : 0);
        showToast.info(`💳 Confirm purchase — ${formatListingQuote(toastTotal, toastCurrency)}`);

        const { VersionedTransaction } = await import("@solana/web3.js");

        const sendViaProxy = async (rawTxBytes: Uint8Array): Promise<string> => {
          const encodedTransaction = Buffer.from(rawTxBytes).toString("base64");
          const response = await fetch("/api/rpc", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              jsonrpc: "2.0",
              id: 1,
              method: "sendTransaction",
              params: [encodedTransaction, { skipPreflight: true, encoding: "base64", maxRetries: 3 }],
            }),
          });
          const data = await response.json();
          if (data.error) throw new Error(data.error.message || JSON.stringify(data.error));
          return data.result;
        };

        const preSimulate = async (base64Transaction: string) => {
          try {
            await fetch("/api/rpc", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                jsonrpc: "2.0",
                id: 1,
                method: "simulateTransaction",
                params: [base64Transaction, { sigVerify: false, encoding: "base64", commitment: "processed" }],
              }),
            });
          } catch {}
        };

        if (v0TxSigned && v0Tx) {
          await preSimulate(v0TxSigned);
          const signedBytes = Uint8Array.from(atob(v0TxSigned), (char) => char.charCodeAt(0));
          const notaryTransaction = VersionedTransaction.deserialize(signedBytes);
          const signedTransaction = await signTransaction(notaryTransaction as any);
          signature = await sendViaProxy((signedTransaction as any).serialize());
        } else if (v0Tx) {
          await preSimulate(v0Tx);
          const transactionBytes = Uint8Array.from(atob(v0Tx), (char) => char.charCodeAt(0));
          const versionedTransaction = VersionedTransaction.deserialize(transactionBytes);
          const signedTransaction = await signTransaction(versionedTransaction as any);
          signature = await sendViaProxy((signedTransaction as any).serialize());
        } else if (legacyTx) {
          const transactionBytes = Uint8Array.from(atob(legacyTx), (char) => char.charCodeAt(0));
          const transaction = Transaction.from(transactionBytes);
          const signedTransaction = await signTransaction(transaction);
          signature = await sendViaProxy(signedTransaction.serialize());
        } else {
          throw new Error("No transaction returned from API");
        }

        let confirmed = false;
        for (let attempt = 0; attempt < 20; attempt++) {
          await new Promise((resolve) => setTimeout(resolve, 3000));
          const statusResponse = await fetch("/api/rpc", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              jsonrpc: "2.0",
              id: 1,
              method: "getSignatureStatuses",
              params: [[signature]],
            }),
          });

          if (statusResponse.status === 429) continue;

          const statusData = await statusResponse.json();
          const status = statusData.result?.value?.[0];
          if (status?.confirmationStatus === "confirmed" || status?.confirmationStatus === "finalized") {
            if (status.err) throw new Error("Transaction failed on-chain");
            confirmed = true;
            break;
          }
        }

        if (confirmed) {
          showToast.success(`✅ Card purchased! TX: ${signature.slice(0, 16)}...`);
        } else {
          showToast.info(`TX sent: ${signature.slice(0, 8)}... — check your wallet`);
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
        } catch (programError: any) {
          console.warn("AuctionProgram.buyNow failed, falling back to direct transfer:", programError);
          throw new Error(`On-chain purchase failed: ${programError.message?.slice(0, 50)}`);
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