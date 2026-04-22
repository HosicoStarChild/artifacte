"use client";

import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  createAssociatedTokenAccountInstruction,
  getAssociatedTokenAddress,
} from "@solana/spl-token";
import { PublicKey, Transaction, TransactionSignature, VersionedTransaction } from "@solana/web3.js";
import { useState } from "react";

import type { DigitalArtNativeListingDetail } from "@/app/digital-art/_lib/server-data";
import type { ExternalMarketplaceListing } from "@/app/lib/digital-art-marketplaces";
import { AuctionCountdownTimer } from "@/components/AuctionCountdownTimer";
import { BidHistory } from "@/components/BidHistory";
import { showToast } from "@/components/ToastContainer";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useWalletCapabilities } from "@/hooks/useWalletCapabilities";
import { AuctionProgram } from "@/lib/auction-program";

const SOL_MINT = new PublicKey("So11111111111111111111111111111111111111112");
const MIN_BID_INCREMENT_LAMPORTS = 100_000_000;

interface AuctionDetailActionPanelProps {
  collectionAddress: string | null;
  externalListing: ExternalMarketplaceListing | null;
  mint: string;
  nativeListing: DigitalArtNativeListingDetail | null;
}

interface TensorStandardWireTransaction {
  tx?: string | null;
  txV0?: string | null;
}

interface TensorStandardBuyResponse {
  blockhash?: string;
  currencySymbol: string;
  error?: string;
  ok: boolean;
  platformFee?: number;
  platformFeeCurrency?: string;
  price: number;
  txs?: TensorStandardWireTransaction[];
}

function sleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function shortAddress(address: string): string {
  return address.length <= 8 ? address : `${address.slice(0, 4)}...${address.slice(-4)}`;
}

function formatSolAmount(lamports: number): string {
  return `◎ ${(lamports / 1_000_000_000).toFixed(4)}`;
}

function formatExternalPrice(listing: ExternalMarketplaceListing): string {
  if (listing.currencySymbol === "SOL") {
    return `◎ ${listing.price.toLocaleString(undefined, {
      maximumFractionDigits: 4,
      minimumFractionDigits: listing.price < 1 ? 2 : 0,
    })}`;
  }

  return `${listing.price.toLocaleString(undefined, {
    maximumFractionDigits: 2,
    minimumFractionDigits: 0,
  })} ${listing.currencySymbol}`;
}

function formatExternalSource(source: ExternalMarketplaceListing["source"]): string {
  return source === "magiceden" ? "Magic Eden" : "Tensor";
}

function formatListedAt(listedAt?: number): string | null {
  if (!listedAt) {
    return null;
  }

  const diff = Date.now() - listedAt;
  if (diff < 60_000) {
    return "just now";
  }
  if (diff < 3_600_000) {
    return `${Math.floor(diff / 60_000)}m ago`;
  }
  if (diff < 86_400_000) {
    return `${Math.floor(diff / 3_600_000)}h ago`;
  }

  return `${Math.floor(diff / 86_400_000)}d ago`;
}

function formatFeeDisplay(amount: number, currency: string): string {
  if (currency === "SOL") {
    return `◎ ${amount.toLocaleString(undefined, {
      maximumFractionDigits: 4,
      minimumFractionDigits: amount < 1 ? 2 : 0,
    })}`;
  }

  return `$${amount.toLocaleString(undefined, {
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
  })}`;
}

function getExternalTransactionPath(listing: ExternalMarketplaceListing): string {
  switch (listing.buyKind) {
    case "tensorCompressed":
      return "Tensor compressed buy flow";
    case "tensorStandard":
      return "Tensor standard listing";
    case "magicedenM3":
      return "Magic Eden M3 listing";
    case "magicedenM2":
      return "Magic Eden auction house listing";
  }
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unexpected error";
}

function isRejectedError(message: string): boolean {
  const normalizedMessage = message.toLowerCase();
  return normalizedMessage.includes("user rejected") || normalizedMessage.includes("transaction cancelled");
}

function showActionError(error: unknown): void {
  const message = getErrorMessage(error);

  if (isRejectedError(message)) {
    showToast.error("Transaction cancelled");
    return;
  }

  if (message.toLowerCase().includes("insufficient")) {
    showToast.error("Insufficient balance");
    return;
  }

  if (
    message.toLowerCase().includes("no longer available") ||
    message.toLowerCase().includes("already been sold")
  ) {
    showToast.error("This item has already been sold");
    return;
  }

  showToast.error(`Error: ${message.slice(0, 120)}`);
}

export function AuctionDetailActionPanel({
  collectionAddress,
  externalListing,
  mint,
  nativeListing,
}: AuctionDetailActionPanelProps) {
  const {
    anchorWallet,
    connected,
    connection,
    publicKey,
    sendTransaction,
    signTransaction,
    walletName,
  } = useWalletCapabilities();

  const [currentNativeListing, setCurrentNativeListing] = useState(nativeListing);
  const [auctionEnded, setAuctionEnded] = useState(false);
  const [bidAmount, setBidAmount] = useState("");
  const [externalSold, setExternalSold] = useState(false);
  const [loadingAction, setLoadingAction] = useState(false);

  async function sendAndConfirmRawTransaction(
    rawTransaction: Uint8Array,
    blockhash?: string
  ): Promise<{ confirmed: boolean; signature: TransactionSignature }> {
    showToast.info("⏳ Submitting transaction...");

    const signature = await connection.sendRawTransaction(rawTransaction, {
      maxRetries: 0,
      skipPreflight: true,
    });

    const startTime = Date.now();
    let confirmed = false;

    while (!confirmed && Date.now() - startTime < 60_000) {
      const status = await connection.getSignatureStatus(signature);

      if (
        status?.value?.confirmationStatus === "confirmed" ||
        status?.value?.confirmationStatus === "finalized"
      ) {
        confirmed = true;
        break;
      }

      if (status?.value?.err) {
        throw new Error("Transaction failed on-chain");
      }

      if (blockhash) {
        const validity = await connection.isBlockhashValid(blockhash);
        if (!validity.value) {
          break;
        }
      }

      try {
        await connection.sendRawTransaction(rawTransaction, {
          maxRetries: 0,
          skipPreflight: true,
        });
      } catch {}

      await sleep(1000);
    }

    return { confirmed, signature };
  }

  async function handleExternalMagicEdenBuy(): Promise<void> {
    if (!publicKey || !connected || !signTransaction || !externalListing) {
      showToast.error("Please connect your wallet first");
      return;
    }

    setLoadingAction(true);
    try {
      showToast.info("Building transaction...");

      const { executeMagicEdenBuy } = await import("@/lib/client/magic-eden-buy-client");
      const result = await executeMagicEdenBuy({
        buyer: publicKey.toBase58(),
        collectionAddress: externalListing.collectionAddress,
        collectionName: externalListing.collectionName,
        listingDisplayPrice: {
          amount: externalListing.price,
          currency: externalListing.currencySymbol,
        },
        mint: externalListing.mint,
        onStatus: showToast.info,
        signTransaction,
        source: externalListing.source,
      });

      if (result.confirmed) {
        showToast.success(
          `✅ NFT purchased for ${formatFeeDisplay(result.totalPrice, result.currency)}!`
        );
      } else {
        showToast.info(`⏳ TX sent: ${result.sig.slice(0, 8)}... — check your wallet in a moment`);
      }

      setExternalSold(true);
    } catch (error) {
      showActionError(error);
    } finally {
      setLoadingAction(false);
    }
  }

  async function handleExternalTensorBuy(): Promise<void> {
    if (!publicKey || !connected || !signTransaction || !externalListing) {
      showToast.error("Please connect your wallet first");
      return;
    }

    setLoadingAction(true);
    try {
      if (externalListing.buyKind === "tensorCompressed") {
        const { executeTensorBuy } = await import("@/lib/tensor-buy-client");
        const result = await executeTensorBuy(
          externalListing.mint,
          publicKey.toBase58(),
          signTransaction,
          showToast.info,
          sendTransaction ?? undefined,
          walletName ?? undefined,
          {
            collectionAddress: externalListing.collectionAddress,
            collectionName: externalListing.collectionName,
            source: externalListing.source,
          }
        );

        if (result.confirmed) {
          showToast.success(
            `✅ NFT purchased for ${formatFeeDisplay(result.totalPrice, result.currency)}!`
          );
        } else {
          showToast.info("Transaction sent but not confirmed yet. Check Solscan.");
        }

        setExternalSold(true);
        return;
      }

      showToast.info("Building transaction...");

      const buildResponse = await fetch("/api/tensor-buy-standard", {
        body: JSON.stringify({
          buyer: publicKey.toBase58(),
          collectionAddress: externalListing.collectionAddress,
          mint: externalListing.mint,
        }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });
      const payload = (await buildResponse.json()) as TensorStandardBuyResponse;

      if (!buildResponse.ok || !payload.ok) {
        throw new Error(payload.error ?? `Buy failed: ${buildResponse.status}`);
      }

      const transactions = Array.isArray(payload.txs) ? payload.txs : [];
      if (!transactions.length) {
        throw new Error("Tensor did not return any transactions");
      }

      const totalPrice = payload.price + (payload.platformFee ?? 0);
      showToast.info(
        `💳 Confirm purchase — ${formatFeeDisplay(totalPrice, payload.platformFeeCurrency ?? payload.currencySymbol)}`
      );

      let lastSignature = "";
      let allConfirmed = true;

      for (const wireTransaction of transactions) {
        const transactionBase64 = wireTransaction.txV0 ?? wireTransaction.tx ?? null;
        if (!transactionBase64) {
          continue;
        }

        const transactionBytes = Uint8Array.from(atob(transactionBase64), (character) =>
          character.charCodeAt(0)
        );

        let rawTransaction: Uint8Array;
        if (wireTransaction.txV0) {
          const versionedTransaction = VersionedTransaction.deserialize(transactionBytes);
          const feePayer = versionedTransaction.message.staticAccountKeys[0];

          if (feePayer?.toBase58() !== publicKey.toBase58()) {
            throw new Error("Transaction fee payer does not match connected wallet");
          }

          const signedTransaction = await signTransaction(versionedTransaction);
          rawTransaction = signedTransaction.serialize();
        } else {
          const legacyTransaction = Transaction.from(transactionBytes);

          if (
            legacyTransaction.feePayer &&
            legacyTransaction.feePayer.toBase58() !== publicKey.toBase58()
          ) {
            throw new Error("Transaction fee payer does not match connected wallet");
          }

          const signedTransaction = await signTransaction(legacyTransaction);
          rawTransaction = signedTransaction.serialize();
        }

        const result = await sendAndConfirmRawTransaction(rawTransaction, payload.blockhash);
        lastSignature = result.signature;
        allConfirmed = allConfirmed && result.confirmed;
      }

      if (allConfirmed) {
        showToast.success(
          `✅ NFT purchased for ${formatFeeDisplay(totalPrice, payload.platformFeeCurrency ?? payload.currencySymbol)}!`
        );
      } else if (lastSignature) {
        showToast.info(
          `⏳ TX sent: ${lastSignature.slice(0, 8)}... — confirmation may take a moment`
        );
      }

      setExternalSold(true);
    } catch (error) {
      showActionError(error);
    } finally {
      setLoadingAction(false);
    }
  }

  async function handleBuyNow(): Promise<void> {
    if (!publicKey || !connected || !anchorWallet || !currentNativeListing) {
      showToast.error("Please connect your wallet first");
      return;
    }

    setLoadingAction(true);
    try {
      const nftMint = new PublicKey(mint);
      const nftTokenProgram = currentNativeListing.isToken2022
        ? TOKEN_2022_PROGRAM_ID
        : TOKEN_PROGRAM_ID;
      const buyerPaymentAccount = await getAssociatedTokenAddress(SOL_MINT, publicKey);
      const sellerPaymentAccount = await getAssociatedTokenAddress(
        SOL_MINT,
        new PublicKey(currentNativeListing.seller)
      );
      const buyerNftAccount = await getAssociatedTokenAddress(
        nftMint,
        publicKey,
        false,
        nftTokenProgram
      );

      const auctionProgram = new AuctionProgram(connection, anchorWallet, sendTransaction);
      await auctionProgram.buyNow(
        nftMint,
        sellerPaymentAccount,
        buyerPaymentAccount,
        buyerNftAccount,
        currentNativeListing.priceLamports,
        SOL_MINT
      );

      showToast.success("Purchase successful!");
      setCurrentNativeListing((previous) =>
        previous ? { ...previous, status: "settled" } : previous
      );
    } catch (error) {
      showActionError(error);
    } finally {
      setLoadingAction(false);
    }
  }

  async function handlePlaceBid(): Promise<void> {
    if (!publicKey || !connected || !anchorWallet || !currentNativeListing) {
      showToast.error("Please connect your wallet first");
      return;
    }

    const numericBid = Number.parseFloat(bidAmount);
    if (!Number.isFinite(numericBid) || numericBid <= 0) {
      showToast.error("Please enter a valid bid amount");
      return;
    }

    const newBidLamports = Math.floor(numericBid * 1_000_000_000);
    const minimumBidLamports = currentNativeListing.currentBidLamports
      ? currentNativeListing.currentBidLamports + MIN_BID_INCREMENT_LAMPORTS
      : currentNativeListing.priceLamports;

    if (newBidLamports < minimumBidLamports) {
      showToast.error(`Minimum bid is ${formatSolAmount(minimumBidLamports)}`);
      return;
    }

    setLoadingAction(true);
    try {
      const nftMint = new PublicKey(mint);
      const bidderTokenAccount = await getAssociatedTokenAddress(SOL_MINT, publicKey);
      const previousBidderAccount =
        currentNativeListing.currentBidLamports && currentNativeListing.highestBidder
          ? await getAssociatedTokenAddress(
              SOL_MINT,
              new PublicKey(currentNativeListing.highestBidder)
            )
          : publicKey;

      const auctionProgram = new AuctionProgram(connection, anchorWallet, sendTransaction);
      await auctionProgram.placeBid(
        nftMint,
        newBidLamports,
        bidderTokenAccount,
        SOL_MINT,
        previousBidderAccount
      );

      showToast.success("Bid placed successfully!");
      setBidAmount("");
      setCurrentNativeListing((previous) =>
        previous
          ? {
              ...previous,
              currentBidLamports: newBidLamports,
              highestBidder: publicKey.toBase58(),
            }
          : previous
      );
    } catch (error) {
      showActionError(error);
    } finally {
      setLoadingAction(false);
    }
  }

  async function handleSettleAuction(): Promise<void> {
    if (!publicKey || !connected || !anchorWallet || !currentNativeListing) {
      showToast.error("Please connect your wallet first");
      return;
    }

    if (!currentNativeListing.highestBidder) {
      showToast.error("This auction has no winning bidder");
      return;
    }

    setLoadingAction(true);
    try {
      const nftMint = new PublicKey(mint);
      const nftTokenProgram = currentNativeListing.isToken2022
        ? TOKEN_2022_PROGRAM_ID
        : TOKEN_PROGRAM_ID;
      const sellerPaymentAccount = await getAssociatedTokenAddress(
        SOL_MINT,
        new PublicKey(currentNativeListing.seller)
      );
      const buyerNftAccount = await getAssociatedTokenAddress(
        nftMint,
        new PublicKey(currentNativeListing.highestBidder),
        false,
        nftTokenProgram
      );
      const sellerNftAccount = await getAssociatedTokenAddress(
        nftMint,
        new PublicKey(currentNativeListing.seller),
        false,
        nftTokenProgram
      );

      const auctionProgram = new AuctionProgram(connection, anchorWallet, sendTransaction);
      await auctionProgram.settleAuction(
        nftMint,
        sellerPaymentAccount,
        buyerNftAccount,
        sellerNftAccount,
        SOL_MINT
      );

      showToast.success("Auction settled successfully!");
      setCurrentNativeListing((previous) =>
        previous ? { ...previous, status: "settled" } : previous
      );
    } catch (error) {
      showActionError(error);
    } finally {
      setLoadingAction(false);
    }
  }

  async function handleCancelListing(): Promise<void> {
    if (!publicKey || !connected || !anchorWallet || !currentNativeListing) {
      showToast.error("Please connect your wallet first");
      return;
    }

    if (!sendTransaction) {
      showToast.error("Wallet does not support transaction submission");
      return;
    }

    setLoadingAction(true);
    try {
      const nftMint = new PublicKey(mint);
      const tokenProgramId = currentNativeListing.isToken2022
        ? TOKEN_2022_PROGRAM_ID
        : TOKEN_PROGRAM_ID;
      const sellerNftAccount = await getAssociatedTokenAddress(
        nftMint,
        publicKey,
        false,
        tokenProgramId
      );
      const tokenAccountInfo = await connection.getAccountInfo(sellerNftAccount);

      if (!tokenAccountInfo) {
        const createAtaTransaction = new Transaction().add(
          createAssociatedTokenAccountInstruction(
            publicKey,
            sellerNftAccount,
            publicKey,
            nftMint,
            tokenProgramId,
            ASSOCIATED_TOKEN_PROGRAM_ID
          )
        );
        const accountSignature = await sendTransaction(createAtaTransaction, connection);
        await connection.confirmTransaction(accountSignature, "confirmed");
      }

      const auctionProgram = new AuctionProgram(connection, anchorWallet, sendTransaction);
      await auctionProgram.cancelListing(nftMint, sellerNftAccount);

      showToast.success("Listing cancelled successfully!");
      setCurrentNativeListing((previous) =>
        previous ? { ...previous, status: "cancelled" } : previous
      );
    } catch (error) {
      showActionError(error);
    } finally {
      setLoadingAction(false);
    }
  }

  if (externalListing) {
    const listedAt = formatListedAt(externalListing.listedAt);

    return (
      <div className="space-y-6">
        {externalSold ? (
          <Card className="border-emerald-500/20 bg-emerald-500/10 py-0">
            <CardContent className="px-5 py-4 text-sm text-emerald-200">
              Purchase submitted. Refresh the collection page in a moment to confirm the listing is gone.
            </CardContent>
          </Card>
        ) : null}

        <Card className="border-white/10 bg-dark-800/90 py-0">
          <CardContent className="px-6 py-6">
            <p className="text-sm text-white/45">Listed Price</p>
            <p className="mt-2 font-serif text-4xl text-gold-400">
              {formatExternalPrice(externalListing)}
            </p>
            {listedAt ? <p className="mt-2 text-xs text-white/40">Listed {listedAt}</p> : null}
          </CardContent>
        </Card>

        <div className="grid gap-4 md:grid-cols-2">
          <Card className="border-white/10 bg-dark-800/90 py-0">
            <CardContent className="px-6 py-5">
              <p className="text-sm text-white/45">Seller</p>
              <p className="mt-2 font-mono text-sm text-white">
                {shortAddress(externalListing.seller)}
              </p>
            </CardContent>
          </Card>

          <Card className="border-white/10 bg-dark-800/90 py-0">
            <CardContent className="px-6 py-5">
              <p className="text-sm text-white/45">Transaction Path</p>
              <p className="mt-2 text-sm text-white">
                {getExternalTransactionPath(externalListing)}
              </p>
            </CardContent>
          </Card>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row">
          <Button
            onClick={() => {
              if (externalListing.source === "magiceden") {
                void handleExternalMagicEdenBuy();
              } else {
                void handleExternalTensorBuy();
              }
            }}
            disabled={!connected || loadingAction || externalSold}
            className="h-12 flex-1 bg-gold-500 text-base text-dark-900 hover:bg-gold-500/90 disabled:bg-white/10 disabled:text-white/35"
          >
            {loadingAction
              ? "Processing..."
              : !connected
                ? "Connect Wallet to Buy"
                : externalSold
                  ? "Purchase Submitted"
                  : "Buy Now"}
          </Button>

          {externalListing.marketplaceUrl ? (
            <a
              href={externalListing.marketplaceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-12 items-center justify-center rounded-md border border-white/10 bg-dark-800 px-5 text-sm font-medium text-white transition hover:border-gold-500/30"
            >
              View on {formatExternalSource(externalListing.source)}
            </a>
          ) : null}
        </div>
      </div>
    );
  }

  if (!currentNativeListing) {
    return null;
  }

  const isFixedPrice = currentNativeListing.listingType === "fixed";
  const isAuction = currentNativeListing.listingType === "auction";
  const isSeller = currentNativeListing.seller === publicKey?.toBase58();
  const isSettled = currentNativeListing.status === "settled";
  const isCancelled = currentNativeListing.status === "cancelled";
  const currentBidLamports = currentNativeListing.currentBidLamports ?? 0;
  const minimumBidLamports = currentBidLamports
    ? currentBidLamports + MIN_BID_INCREMENT_LAMPORTS
    : currentNativeListing.priceLamports;

  return (
    <div className="space-y-6">
      {isSettled ? (
        <Card className="border-emerald-500/20 bg-emerald-500/10 py-0">
          <CardContent className="px-5 py-4 text-sm text-emerald-200">Auction settled</CardContent>
        </Card>
      ) : null}

      {isCancelled ? (
        <Card className="border-red-500/20 bg-red-500/10 py-0">
          <CardContent className="px-5 py-4 text-sm text-red-200">Listing cancelled</CardContent>
        </Card>
      ) : null}

      {isAuction && !isSettled && !isCancelled ? (
        <Card className="border-white/10 bg-dark-800/90 py-0">
          <CardContent className="px-6 py-6">
            <p className="mb-4 text-sm text-white/45">Time Remaining</p>
            <AuctionCountdownTimer
              endTime={currentNativeListing.endTime ?? 0}
              onEnded={() => setAuctionEnded(true)}
            />
          </CardContent>
        </Card>
      ) : null}

      <Card className="border-white/10 bg-dark-800/90 py-0">
        <CardContent className="px-6 py-6">
          <p className="text-sm text-white/45">
            {isFixedPrice
              ? "Listed Price"
              : currentBidLamports > 0
                ? "Current Highest Bid"
                : "Starting Bid"}
          </p>
          <p className="mt-2 font-serif text-4xl text-gold-400">
            {formatSolAmount(Math.max(currentNativeListing.priceLamports, currentBidLamports))}
          </p>
          {currentBidLamports > 0 && currentNativeListing.highestBidder ? (
            <p className="mt-2 text-xs text-white/40">
              Leading bidder: {shortAddress(currentNativeListing.highestBidder)}
            </p>
          ) : null}
        </CardContent>
      </Card>

      {isAuction && !isSettled && !isCancelled && !auctionEnded ? (
        <Card className="border-white/10 bg-dark-800/90 py-0">
          <CardContent className="space-y-4 px-6 py-6">
            <div className="space-y-1">
              <p className="text-sm font-medium uppercase tracking-[0.2em] text-gold-400">
                Place Your Bid
              </p>
              <p className="text-sm text-white/45">Enter your bid amount in SOL.</p>
            </div>

            <div className="space-y-3">
              <label className="block text-xs text-white/45">Bid Amount (SOL)</label>
              <div className="flex items-center gap-2">
                <span className="text-lg text-white">◎</span>
                <Input
                  type="number"
                  step="0.1"
                  min={minimumBidLamports / 1_000_000_000}
                  value={bidAmount}
                  onChange={(event) => setBidAmount(event.target.value)}
                  className="border-white/10 bg-dark-900 text-white"
                  placeholder="0.00"
                />
              </div>
              <p className="text-xs text-white/40">Minimum: {formatSolAmount(minimumBidLamports)}</p>
            </div>

            {bidAmount ? (
              <Card className="border-white/10 bg-dark-900 py-0">
                <CardContent className="px-4 py-3 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="text-white/45">Your Bid</span>
                    <span className="font-semibold text-gold-400">◎ {bidAmount}</span>
                  </div>
                </CardContent>
              </Card>
            ) : null}

            <Button
              onClick={() => {
                void handlePlaceBid();
              }}
              disabled={!connected || !bidAmount || loadingAction}
              className="h-12 w-full bg-gold-500 text-dark-900 hover:bg-gold-500/90 disabled:bg-white/10 disabled:text-white/35"
            >
              {loadingAction ? "Placing Bid..." : !connected ? "Connect Wallet" : "Place Bid"}
            </Button>
          </CardContent>
        </Card>
      ) : null}

      {isFixedPrice && !isSettled && !isCancelled ? (
        <Button
          onClick={() => {
            void handleBuyNow();
          }}
          disabled={!connected || loadingAction}
          className="h-12 w-full bg-gold-500 text-base text-dark-900 hover:bg-gold-500/90 disabled:bg-white/10 disabled:text-white/35"
        >
          {loadingAction ? "Processing..." : !connected ? "Connect Wallet to Buy" : "Buy Now"}
        </Button>
      ) : null}

      {isAuction && auctionEnded && !isSettled && !isCancelled && currentBidLamports > 0 ? (
        <Button
          onClick={() => {
            void handleSettleAuction();
          }}
          disabled={loadingAction}
          className="h-12 w-full bg-sky-600 text-white hover:bg-sky-500 disabled:bg-white/10 disabled:text-white/35"
        >
          {loadingAction ? "Settling..." : "Settle Auction"}
        </Button>
      ) : null}

      {isAuction && auctionEnded && !isSettled && !isCancelled && currentBidLamports === 0 && isSeller ? (
        <Card className="border-yellow-500/20 bg-yellow-500/10 py-0">
          <CardContent className="px-5 py-4 text-sm text-yellow-100">
            Auction ended with no bids. Cancel the listing to reclaim your NFT from escrow.
          </CardContent>
        </Card>
      ) : null}

      {isSeller && !isSettled && !isCancelled && !(isAuction && !auctionEnded && currentBidLamports > 0) ? (
        <div className="space-y-3 border-t border-white/10 pt-4">
          <p className="text-xs text-white/40">
            {isAuction && currentBidLamports > 0
              ? "Cannot cancel after bids have been placed"
              : isAuction && auctionEnded
                ? "Cancel to return NFT to your wallet"
                : "You can cancel this listing anytime"}
          </p>
          <Button
            onClick={() => {
              void handleCancelListing();
            }}
            disabled={(isAuction && currentBidLamports > 0) || loadingAction}
            variant="outline"
            className="h-10 w-full border-red-500/30 bg-red-500/10 text-red-100 hover:bg-red-500/20 disabled:bg-white/5 disabled:text-white/35"
          >
            {loadingAction ? "Cancelling..." : "Cancel Listing"}
          </Button>
        </div>
      ) : null}

      {isAuction ? (
        <div className="space-y-4">
          <h2 className="font-serif text-2xl text-white">Bid History</h2>
          <BidHistory
            key={`${mint}:${currentBidLamports}:${currentNativeListing.highestBidder ?? ""}`}
            nftMint={mint}
            connection={connection}
            currentBid={currentBidLamports}
            highestBidder={currentNativeListing.highestBidder ?? undefined}
          />
        </div>
      ) : null}

      <Card className="border-white/10 bg-dark-800/90 py-0">
        <CardContent className="px-6 py-5">
          <p className="text-sm text-white/45">Seller</p>
          <p className="mt-2 font-mono text-sm text-white">
            {shortAddress(currentNativeListing.seller)}
          </p>
        </CardContent>
      </Card>

      <div className="flex flex-wrap gap-2">
        <Badge className="border-white/10 bg-white/5 text-white/75">SOL</Badge>
        {collectionAddress ? (
          <Badge className="border-white/10 bg-white/5 text-white/75">Curated Collection</Badge>
        ) : null}
      </div>
    </div>
  );
}