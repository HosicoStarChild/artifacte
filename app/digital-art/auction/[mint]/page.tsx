"use client";

import { useEffect, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import {
  useWallet,
  useConnection,
  useAnchorWallet,
} from "@solana/wallet-adapter-react";
import {
  PublicKey,
  Transaction,
  VersionedTransaction,
} from "@solana/web3.js";
import {
  getAssociatedTokenAddress,
  createAssociatedTokenAccountInstruction,
  TOKEN_2022_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import Link from "next/link";
import { AuctionProgram } from "@/lib/auction-program";
import { showToast } from "@/components/ToastContainer";
import { AuctionCountdownTimer } from "@/components/AuctionCountdownTimer";
import { BidHistory } from "@/components/BidHistory";

const SOL_MINT = new PublicKey("So11111111111111111111111111111111111111112");
const TOKEN_PROGRAM_ID = new PublicKey(
  "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
);

type MarketplaceSource = "magiceden" | "tensor";

interface ListingData {
  seller: string;
  nftMint: string;
  price: number;
  listingType: { fixedPrice?: {}; auction?: {} };
  status: { active?: {}; settled?: {}; cancelled?: {} };
  endTime: number;
  currentBid: number;
  highestBidder: string;
  escrowNftAccount: string;
  royaltyBasisPoints: number;
  creatorAddress: string;
}

interface NFTData {
  name: string;
  image: string;
  collection: string;
}

interface ExternalMarketplaceListing {
  id: string;
  source: MarketplaceSource;
  mint: string;
  name: string;
  image: string;
  collectionAddress: string;
  collectionName: string;
  price: number;
  priceRaw: number;
  currencySymbol: string;
  currencyMint: string;
  seller: string;
  listedAt?: number;
  buyKind: "magicedenM2" | "magicedenM3" | "tensorStandard" | "tensorCompressed";
  marketplaceUrl?: string;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function shortAddress(address: string): string {
  if (!address) return "";
  return `${address.slice(0, 4)}...${address.slice(-4)}`;
}

function formatExternalPrice(listing: ExternalMarketplaceListing): string {
  if (listing.currencySymbol === "SOL") {
    return `◎ ${listing.price.toLocaleString(undefined, {
      minimumFractionDigits: listing.price < 1 ? 2 : 0,
      maximumFractionDigits: 4,
    })}`;
  }

  return `${listing.price.toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })} ${listing.currencySymbol}`;
}

function formatExternalSource(source: MarketplaceSource): string {
  return source === "magiceden" ? "Magic Eden" : "Tensor";
}

function formatListedAt(listedAt?: number): string | null {
  if (!listedAt) return null;

  const diff = Date.now() - listedAt;
  if (diff < 60_000) return "just now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return `${Math.floor(diff / 86_400_000)}d ago`;
}

export default function AuctionDetailPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const mint = params.mint as string;
  const sourceParam = searchParams.get("source");
  const collectionAddress = searchParams.get("collection") || "";
  const source: MarketplaceSource | null =
    sourceParam === "magiceden" || sourceParam === "tensor"
      ? sourceParam
      : null;

  const {
    publicKey,
    connected,
    sendTransaction,
    signTransaction,
    wallet,
  } = useWallet();
  const anchorWallet = useAnchorWallet();
  const { connection } = useConnection();

  const [listing, setListing] = useState<ListingData | null>(null);
  const [externalListing, setExternalListing] =
    useState<ExternalMarketplaceListing | null>(null);
  const [nft, setNFT] = useState<NFTData | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingAction, setLoadingAction] = useState(false);
  const [bidAmount, setBidAmount] = useState("");
  const [auctionEnded, setAuctionEnded] = useState(false);
  const [externalSold, setExternalSold] = useState(false);

  const backHref = collectionAddress
    ? `/digital-art/${collectionAddress}`
    : "/digital-art";
  const isExternal = Boolean(source);
  const isFixedPrice =
    !isExternal && listing?.listingType?.fixedPrice !== undefined;
  const isAuction = !isExternal && listing?.listingType?.auction !== undefined;
  const isSeller = !isExternal && listing?.seller === publicKey?.toBase58();
  const isSettled = !isExternal && listing?.status?.settled !== undefined;
  const isCancelled = !isExternal && listing?.status?.cancelled !== undefined;

  useEffect(() => {
    setAuctionEnded(false);
    setBidAmount("");
    setExternalSold(false);

    if (source) {
      void loadExternalListingData();
      return;
    }

    void loadNativeListingData();
  }, [mint, source, collectionAddress]);

  async function loadNativeListingData() {
    setLoading(true);
    setExternalListing(null);

    try {
      const nftMint = new PublicKey(mint);
      const dummyWallet = {
        publicKey: PublicKey.default,
        signTransaction: async (tx: any) => tx,
        signAllTransactions: async (txs: any) => txs,
      };
      const auctionProgram = new AuctionProgram(connection, dummyWallet as any);
      const listingData = await auctionProgram.fetchListing(nftMint);

      if (!listingData) {
        setListing(null);
        setNFT(null);
        return;
      }

      setListing({
        ...listingData,
        seller: listingData.seller?.toBase58?.() || listingData.seller,
        nftMint: listingData.nftMint?.toBase58?.() || listingData.nftMint,
        price: listingData.price?.toNumber?.() || Number(listingData.price),
        endTime:
          listingData.endTime?.toNumber?.() || Number(listingData.endTime),
        currentBid:
          listingData.currentBid?.toNumber?.() || Number(listingData.currentBid),
        highestBidder:
          listingData.highestBidder?.toBase58?.() || listingData.highestBidder,
        escrowNftAccount:
          listingData.escrowNftAccount?.toBase58?.() ||
          listingData.escrowNftAccount,
        creatorAddress:
          listingData.creatorAddress?.toBase58?.() || listingData.creatorAddress,
        royaltyBasisPoints: listingData.royaltyBasisPoints || 0,
      });

      try {
        const res = await fetch(`/api/nft?mint=${mint}`);
        const data = await res.json();
        setNFT(data.nft || null);
      } catch (error) {
        console.error("Failed to fetch NFT metadata:", error);
      }
    } catch (error) {
      console.error("Failed to load listing:", error);
      showToast.error("Failed to load listing");
    } finally {
      setLoading(false);
    }
  }

  async function loadExternalListingData() {
    setLoading(true);
    setListing(null);

    if (!source || !collectionAddress) {
      setExternalListing(null);
      setNFT(null);
      setLoading(false);
      return;
    }

    try {
      const query = new URLSearchParams({
        mint,
        source,
        collection: collectionAddress,
      });
      const res = await fetch(
        `/api/digital-art/marketplace-listing?${query.toString()}`
      );
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setExternalListing(null);
        setNFT(null);
        return;
      }

      setExternalListing(data.listing || null);
      setNFT(
        data.listing
          ? {
              name: data.listing.name,
              image: data.listing.image,
              collection: data.listing.collectionName,
            }
          : null
      );
    } catch (error) {
      console.error("Failed to load marketplace listing:", error);
    } finally {
      setLoading(false);
    }
  }

  async function sendAndConfirmRawTransaction(
    rawTx: Uint8Array,
    blockhash?: string
  ) {
    showToast.info("⏳ Submitting transaction...");
    const signature = await connection.sendRawTransaction(rawTx, {
      skipPreflight: true,
      maxRetries: 0,
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
        const isValid = await connection.isBlockhashValid(blockhash);
        if (!isValid?.value) {
          break;
        }
      }

      try {
        await connection.sendRawTransaction(rawTx, {
          skipPreflight: true,
          maxRetries: 0,
        });
      } catch {
        // Ignore retries that race with the network.
      }

      await sleep(1000);
    }

    return { signature, confirmed };
  }

  async function handleExternalMagicEdenBuy() {
    if (!publicKey || !connected || !signTransaction || !externalListing) {
      showToast.error("Please connect your wallet first");
      return;
    }

    setLoadingAction(true);
    try {
      showToast.info("Building transaction...");

      const buildRes = await fetch("/api/me-buy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mint: externalListing.mint,
          buyer: publicKey.toBase58(),
        }),
      });

      const payload = await buildRes.json().catch(() => ({}));
      if (!buildRes.ok) {
        throw new Error(payload.error || `Buy failed: ${buildRes.status}`);
      }

      const { v0Tx, v0TxSigned, legacyTx, price, platformFee, blockhash } = payload;
      const versionedTxBase64 = v0TxSigned || v0Tx;
      const txBase64 = versionedTxBase64 || legacyTx;

      if (!txBase64) {
        throw new Error("No transaction returned from API");
      }

      const feeDisplay = platformFee ? ` + ${platformFee.toFixed(4)} SOL fee` : '';
      showToast.info(`💳 Confirm purchase — ${price} SOL${feeDisplay}`);

      let rawTx: Uint8Array;
      if (versionedTxBase64) {
        const txBytes = Uint8Array.from(atob(versionedTxBase64), (char) =>
          char.charCodeAt(0)
        );
        const vTx = VersionedTransaction.deserialize(txBytes);
        const feePayer = vTx.message.staticAccountKeys[0];

        if (feePayer.toBase58() !== publicKey.toBase58()) {
          throw new Error("Transaction fee payer does not match connected wallet");
        }

        try {
          await fetch("/api/rpc", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              jsonrpc: "2.0",
              id: 1,
              method: "simulateTransaction",
              params: [
                versionedTxBase64,
                { sigVerify: false, encoding: "base64", commitment: "processed" },
              ],
            }),
          });
        } catch {
          // Ignore simulation failures before wallet signing.
        }

        const signed = await signTransaction(vTx as any);
        rawTx = signed.serialize();
      } else {
        const txBytes = Uint8Array.from(atob(txBase64), (char) =>
          char.charCodeAt(0)
        );
        const tx = Transaction.from(txBytes);

        if (tx.feePayer && tx.feePayer.toBase58() !== publicKey.toBase58()) {
          throw new Error("Transaction fee payer does not match connected wallet");
        }

        const signed = await signTransaction(tx as any);
        rawTx = signed.serialize();
      }

      const result = await sendAndConfirmRawTransaction(rawTx, blockhash);
      if (result.confirmed) {
        showToast.success(`✅ NFT purchased for ${price} SOL!`);
      } else {
        showToast.info(
          `⏳ TX sent: ${result.signature.slice(0, 8)}... — check your wallet in a moment`
        );
      }

      setExternalSold(true);
    } catch (error: any) {
      if (
        error.message?.includes("User rejected") ||
        error.message?.includes("user rejected")
      ) {
        showToast.error("Transaction cancelled");
      } else if (error.message?.includes("insufficient")) {
        showToast.error("Insufficient balance");
      } else if (
        error.message?.includes("no longer available") ||
        error.message?.includes("already been sold")
      ) {
        showToast.error("This item has already been sold");
      } else {
        showToast.error(`Error: ${(error.message || "").slice(0, 120)}`);
      }
    } finally {
      setLoadingAction(false);
    }
  }

  async function handleExternalTensorBuy() {
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
          wallet?.adapter?.name
        );

        if (result.confirmed) {
          showToast.success(
            `✅ NFT purchased for ${result.price} ${externalListing.currencySymbol}!`
          );
        } else {
          showToast.info(
            `Transaction sent but not confirmed yet. Check Solscan.`
          );
        }

        setExternalSold(true);
        return;
      }

      showToast.info("Building transaction...");

      const buildRes = await fetch("/api/tensor-buy-standard", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          collectionAddress,
          mint: externalListing.mint,
          buyer: publicKey.toBase58(),
        }),
      });

      const payload = await buildRes.json().catch(() => ({}));
      if (!buildRes.ok) {
        throw new Error(payload.error || `Buy failed: ${buildRes.status}`);
      }

      const txs = Array.isArray(payload.txs) ? payload.txs : [];
      if (!txs.length) {
        throw new Error("Tensor did not return any transactions");
      }

      const feeDisplay = payload.platformFee ? ` + ${payload.platformFee.toFixed(4)} SOL fee` : '';
      showToast.info(`💳 Confirm purchase — ${payload.price} ${payload.currencySymbol}${feeDisplay}`);

      let lastSignature = "";
      let allConfirmed = true;

      for (const tx of txs) {
        const isVersioned = Boolean(tx.txV0);
        const txBase64 = tx.txV0 || tx.tx;
        if (!txBase64) continue;

        const txBytes = Uint8Array.from(atob(txBase64), (char) =>
          char.charCodeAt(0)
        );

        let rawTx: Uint8Array;
        if (isVersioned) {
          const vTx = VersionedTransaction.deserialize(txBytes);
          const feePayer = vTx.message.staticAccountKeys[0];
          if (feePayer.toBase58() !== publicKey.toBase58()) {
            throw new Error(
              "Transaction fee payer does not match connected wallet"
            );
          }
          const signed = await signTransaction(vTx as any);
          rawTx = signed.serialize();
        } else {
          const legacyTx = Transaction.from(txBytes);
          if (
            legacyTx.feePayer &&
            legacyTx.feePayer.toBase58() !== publicKey.toBase58()
          ) {
            throw new Error(
              "Transaction fee payer does not match connected wallet"
            );
          }
          const signed = await signTransaction(legacyTx as any);
          rawTx = signed.serialize();
        }

        const result = await sendAndConfirmRawTransaction(
          rawTx,
          payload.blockhash
        );
        lastSignature = result.signature;
        allConfirmed = allConfirmed && result.confirmed;
      }

      if (allConfirmed) {
        showToast.success(
          `✅ NFT purchased for ${payload.price} ${payload.currencySymbol}!`
        );
      } else if (lastSignature) {
        showToast.info(
          `⏳ TX sent: ${lastSignature.slice(0, 8)}... — confirmation may take a moment`
        );
      }

      setExternalSold(true);
    } catch (error: any) {
      if (
        error.message?.includes("User rejected") ||
        error.message?.includes("user rejected")
      ) {
        showToast.error("Transaction cancelled");
      } else if (
        error.message?.includes("no longer available") ||
        error.message?.includes("already been sold")
      ) {
        showToast.error("This item has already been sold");
      } else {
        showToast.error(`Error: ${(error.message || "").slice(0, 120)}`);
      }
    } finally {
      setLoadingAction(false);
    }
  }

  async function handleBuyNow() {
    if (!publicKey || !connected || !anchorWallet || !listing || !nft) {
      showToast.error("Please connect your wallet first");
      return;
    }

    setLoadingAction(true);
    try {
      const nftMint = new PublicKey(mint);
      const mintInfo = await connection.getAccountInfo(nftMint);
      const isToken2022 = mintInfo?.owner.equals(TOKEN_2022_PROGRAM_ID) || false;
      const nftProgram = isToken2022 ? TOKEN_2022_PROGRAM_ID : TOKEN_PROGRAM_ID;

      const buyerPaymentAccount = await getAssociatedTokenAddress(
        SOL_MINT,
        publicKey
      );
      const sellerPaymentAccount = await getAssociatedTokenAddress(
        SOL_MINT,
        new PublicKey(listing.seller)
      );
      const buyerNftAccount = await getAssociatedTokenAddress(
        nftMint,
        publicKey,
        false,
        nftProgram
      );

      const auctionProgram = new AuctionProgram(
        connection,
        anchorWallet,
        sendTransaction
      );
      await auctionProgram.buyNow(
        nftMint,
        sellerPaymentAccount,
        buyerPaymentAccount,
        buyerNftAccount,
        listing.price,
        SOL_MINT
      );

      showToast.success("Purchase successful!");
      setListing((previous: any) =>
        previous ? { ...previous, status: { settled: {} } } : previous
      );
    } catch (error: any) {
      console.error("Purchase failed:", error);
      showToast.error(error.message || "Purchase failed");
    } finally {
      setLoadingAction(false);
    }
  }

  async function handlePlaceBid() {
    if (!publicKey || !connected || !anchorWallet || !listing) {
      showToast.error("Please connect your wallet first");
      return;
    }

    if (!bidAmount || parseFloat(bidAmount) <= 0) {
      showToast.error("Please enter a valid bid amount");
      return;
    }

    const newBidLamports = Math.floor(parseFloat(bidAmount) * 1e9);
    const minIncrement = 0.1 * 1e9;
    const minBid =
      listing.currentBid > 0 ? listing.currentBid + minIncrement : listing.price;

    if (newBidLamports < minBid) {
      showToast.error(`Minimum bid is ◎ ${(minBid / 1e9).toFixed(4)}`);
      return;
    }

    setLoadingAction(true);
    try {
      const nftMint = new PublicKey(mint);
      const bidderTokenAccount = await getAssociatedTokenAddress(
        SOL_MINT,
        publicKey
      );
      const previousBidderAccount =
        listing.currentBid > 0
          ? await getAssociatedTokenAddress(
              SOL_MINT,
              new PublicKey(listing.highestBidder)
            )
          : publicKey;

      const auctionProgram = new AuctionProgram(
        connection,
        anchorWallet,
        sendTransaction
      );
      await auctionProgram.placeBid(
        nftMint,
        newBidLamports,
        bidderTokenAccount,
        SOL_MINT,
        previousBidderAccount
      );

      showToast.success("Bid placed successfully!");
      setBidAmount("");
      setTimeout(() => {
        void loadNativeListingData();
      }, 2000);
    } catch (error: any) {
      console.error("Bid failed:", error);
      showToast.error(error.message || "Bid failed");
    } finally {
      setLoadingAction(false);
    }
  }

  async function handleSettleAuction() {
    if (!publicKey || !connected || !anchorWallet || !listing) {
      showToast.error("Please connect your wallet first");
      return;
    }

    setLoadingAction(true);
    try {
      const nftMint = new PublicKey(mint);
      const mintInfo = await connection.getAccountInfo(nftMint);
      const isToken2022 = mintInfo?.owner.equals(TOKEN_2022_PROGRAM_ID) || false;
      const nftProgram = isToken2022 ? TOKEN_2022_PROGRAM_ID : TOKEN_PROGRAM_ID;

      const sellerPaymentAccount = await getAssociatedTokenAddress(
        SOL_MINT,
        new PublicKey(listing.seller)
      );
      const buyerNftAccount = await getAssociatedTokenAddress(
        nftMint,
        new PublicKey(listing.highestBidder),
        false,
        nftProgram
      );
      const sellerNftAccount = await getAssociatedTokenAddress(
        nftMint,
        new PublicKey(listing.seller),
        false,
        nftProgram
      );

      const auctionProgram = new AuctionProgram(
        connection,
        anchorWallet,
        sendTransaction
      );
      await auctionProgram.settleAuction(
        nftMint,
        sellerPaymentAccount,
        buyerNftAccount,
        sellerNftAccount,
        SOL_MINT
      );

      showToast.success("Auction settled successfully!");
      setListing((previous: any) =>
        previous ? { ...previous, status: { settled: {} } } : previous
      );
    } catch (error: any) {
      console.error("Settlement failed:", error);
      showToast.error(error.message || "Settlement failed");
    } finally {
      setLoadingAction(false);
    }
  }

  async function handleCancelListing() {
    if (!publicKey || !connected || !anchorWallet || !listing) {
      showToast.error("Please connect your wallet first");
      return;
    }

    setLoadingAction(true);
    try {
      const nftMint = new PublicKey(mint);
      const mintInfo = await connection.getAccountInfo(nftMint);
      const isToken2022 = mintInfo?.owner.equals(TOKEN_2022_PROGRAM_ID) || false;
      const tokenProgramId = isToken2022
        ? TOKEN_2022_PROGRAM_ID
        : TOKEN_PROGRAM_ID;

      const sellerNftAccount = await getAssociatedTokenAddress(
        nftMint,
        publicKey,
        false,
        tokenProgramId
      );

      const ataInfo = await connection.getAccountInfo(sellerNftAccount);
      if (!ataInfo) {
        const createAtaIx = createAssociatedTokenAccountInstruction(
          publicKey,
          sellerNftAccount,
          publicKey,
          nftMint,
          tokenProgramId,
          ASSOCIATED_TOKEN_PROGRAM_ID
        );
        const ataTx = new Transaction().add(createAtaIx);
        const ataSig = await sendTransaction(ataTx, connection);
        await connection.confirmTransaction(ataSig, "confirmed");
      }

      const auctionProgram = new AuctionProgram(
        connection,
        anchorWallet,
        sendTransaction
      );
      await auctionProgram.cancelListing(nftMint, sellerNftAccount);

      showToast.success("Listing cancelled successfully!");
      setListing((previous: any) =>
        previous ? { ...previous, status: { cancelled: {} } } : previous
      );
    } catch (error: any) {
      console.error("Cancellation failed:", error);
      showToast.error(error.message || "Cancellation failed");
    } finally {
      setLoadingAction(false);
    }
  }

  if (loading) {
    return (
      <div className="pt-24 pb-20 min-h-screen">
        <div className="max-w-4xl mx-auto px-4">
          <div className="text-center">
            <div className="inline-block animate-spin mb-4">
              <div className="w-8 h-8 border-4 border-gray-700 border-t-gold-500 rounded-full" />
            </div>
            <p className="text-gray-400">Loading listing...</p>
          </div>
        </div>
      </div>
    );
  }

  if (isExternal && !externalListing) {
    return (
      <div className="pt-24 pb-20 min-h-screen">
        <div className="max-w-4xl mx-auto px-4">
          <Link
            href={backHref}
            className="text-gold-500 hover:text-gold-400 text-sm font-medium transition mb-6 inline-block"
          >
            ← Back to Digital Collectibles
          </Link>
          <div className="bg-dark-800 border border-white/10 rounded-xl p-12 text-center">
            <div className="text-5xl mb-4">🔍</div>
            <h2 className="font-serif text-2xl text-white mb-4">
              Listing Not Found
            </h2>
            <p className="text-gray-400">
              This marketplace listing does not exist anymore or is no longer
              available for this curated collection.
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (!isExternal && !listing) {
    return (
      <div className="pt-24 pb-20 min-h-screen">
        <div className="max-w-4xl mx-auto px-4">
          <Link
            href={backHref}
            className="text-gold-500 hover:text-gold-400 text-sm font-medium transition mb-6 inline-block"
          >
            ← Back to Digital Collectibles
          </Link>
          <div className="bg-dark-800 border border-white/10 rounded-xl p-12 text-center">
            <div className="text-5xl mb-4">🔍</div>
            <h2 className="font-serif text-2xl text-white mb-4">
              Listing Not Found
            </h2>
            <p className="text-gray-400">
              This listing does not exist or has been removed.
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (isExternal && externalListing) {
    const listedAt = formatListedAt(externalListing.listedAt);

    return (
      <div className="pt-24 pb-20 min-h-screen">
        <div className="max-w-6xl mx-auto px-4">
          <Link
            href={backHref}
            className="text-gold-500 hover:text-gold-400 text-sm font-medium transition mb-6 inline-block"
          >
            ← Back to Digital Collectibles
          </Link>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <div className="lg:col-span-1">
              <div className="bg-dark-800 border border-white/10 rounded-xl overflow-hidden sticky top-24">
                <div className="aspect-square bg-dark-700 relative">
                  <img
                    src={nft?.image || "/placeholder.png"}
                    alt={nft?.name || "NFT"}
                    className="w-full h-full object-cover"
                    onError={(event) => {
                      (event.target as HTMLImageElement).src = "/placeholder.png";
                    }}
                  />
                </div>
              </div>
            </div>

            <div className="lg:col-span-2 space-y-8">
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <span className="px-3 py-1 rounded-full bg-dark-800 border border-white/10 text-xs font-semibold text-white">
                    {formatExternalSource(externalListing.source)}
                  </span>
                  <span className="px-3 py-1 rounded-full bg-green-900/40 border border-green-700 text-xs font-semibold text-green-200">
                    Buy Now
                  </span>
                  <span className="px-3 py-1 rounded-full bg-white/5 border border-white/10 text-xs font-semibold text-gray-300">
                    {externalListing.currencySymbol}
                  </span>
                </div>
                <p className="text-gray-500 text-sm mb-2">{nft?.collection}</p>
                <h1 className="font-serif text-4xl text-white mb-4">
                  {nft?.name || "Untitled"}
                </h1>
                <p className="text-gray-600 text-xs font-mono">{mint}</p>
              </div>

              {externalSold && (
                <div className="bg-green-900/20 border border-green-700 rounded-lg p-4 text-green-400 text-sm font-medium">
                  ✓ Purchase submitted. Refresh the collection page in a moment to
                  confirm the listing is gone.
                </div>
              )}

              <div className="bg-dark-800 border border-white/10 rounded-xl p-6">
                <p className="text-gray-400 text-sm mb-2">Listed Price</p>
                <p className="text-4xl font-serif text-gold-400">
                  {formatExternalPrice(externalListing)}
                </p>
                {listedAt && (
                  <p className="text-gray-500 text-xs mt-2">Listed {listedAt}</p>
                )}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="bg-dark-800 border border-white/10 rounded-xl p-6">
                  <p className="text-gray-400 text-sm mb-2">Seller</p>
                  <p className="text-white font-mono text-sm">
                    {shortAddress(externalListing.seller)}
                  </p>
                </div>
                <div className="bg-dark-800 border border-white/10 rounded-xl p-6">
                  <p className="text-gray-400 text-sm mb-2">Transaction Path</p>
                  <p className="text-white text-sm">
                    {externalListing.buyKind === "tensorCompressed"
                      ? "Tensor compressed buy flow"
                      : externalListing.buyKind === "tensorStandard"
                        ? "Tensor standard listing"
                        : externalListing.buyKind === "magicedenM3"
                          ? "Magic Eden M3 listing"
                          : "Magic Eden auction house listing"}
                  </p>
                </div>
              </div>

              <div className="flex flex-col sm:flex-row gap-3">
                <button
                  onClick={() => {
                    if (externalListing.source === "magiceden") {
                      void handleExternalMagicEdenBuy();
                    } else {
                      void handleExternalTensorBuy();
                    }
                  }}
                  disabled={!connected || loadingAction || externalSold}
                  className={`flex-1 py-4 rounded-lg font-semibold text-lg transition ${
                    !connected || loadingAction || externalSold
                      ? "bg-gray-700 text-gray-400 cursor-not-allowed"
                      : "bg-gold-500 hover:bg-gold-600 text-dark-900"
                  }`}
                >
                  {loadingAction
                    ? "Processing..."
                    : !connected
                      ? "Connect Wallet to Buy"
                      : externalSold
                        ? "Purchase Submitted"
                        : "Buy Now"}
                </button>

                {externalListing.marketplaceUrl && (
                  <a
                    href={externalListing.marketplaceUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="sm:w-auto px-5 py-4 rounded-lg font-semibold text-sm border border-white/10 bg-dark-800 hover:border-gold-500/30 text-white transition text-center"
                  >
                    View on {formatExternalSource(externalListing.source)}
                  </a>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="pt-24 pb-20 min-h-screen">
      <div className="max-w-6xl mx-auto px-4">
        <Link
          href={backHref}
          className="text-gold-500 hover:text-gold-400 text-sm font-medium transition mb-6 inline-block"
        >
          ← Back to Digital Collectibles
        </Link>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-1">
            <div className="bg-dark-800 border border-white/10 rounded-xl overflow-hidden sticky top-24">
              <div className="aspect-square bg-dark-700 relative">
                <img
                  src={nft?.image || "/placeholder.png"}
                  alt={nft?.name || "NFT"}
                  className="w-full h-full object-cover"
                  onError={(event) => {
                    (event.target as HTMLImageElement).src = "/placeholder.png";
                  }}
                />
              </div>
            </div>
          </div>

          <div className="lg:col-span-2 space-y-8">
            <div>
              <p className="text-gray-500 text-sm mb-2">{nft?.collection}</p>
              <h1 className="font-serif text-4xl text-white mb-4">
                {nft?.name || "Untitled"}
              </h1>
              <p className="text-gray-600 text-xs font-mono">{mint}</p>
            </div>

            {isSettled ? (
              <div className="bg-green-900/20 border border-green-700 rounded-lg p-4 text-green-400 text-sm font-medium">
                ✓ Auction Settled
              </div>
            ) : isCancelled ? (
              <div className="bg-red-900/20 border border-red-700 rounded-lg p-4 text-red-400 text-sm font-medium">
                ✗ Listing Cancelled
              </div>
            ) : null}

            {isAuction && !isSettled && !isCancelled && listing && (
              <div className="bg-dark-800 border border-white/10 rounded-xl p-6">
                <p className="text-gray-400 text-sm mb-4">Time Remaining</p>
                <AuctionCountdownTimer
                  endTime={listing.endTime}
                  onEnded={() => setAuctionEnded(true)}
                />
              </div>
            )}

            {listing && (
              <div className="bg-dark-800 border border-white/10 rounded-xl p-6">
                {isFixedPrice ? (
                  <div>
                    <p className="text-gray-400 text-sm mb-2">Listed Price</p>
                    <p className="text-4xl font-serif text-gold-400">
                      ◎ {(listing.price / 1e9).toFixed(4)}
                    </p>
                  </div>
                ) : (
                  <div>
                    <p className="text-gray-400 text-sm mb-2">
                      {listing.currentBid > 0 ? "Current Highest Bid" : "Starting Bid"}
                    </p>
                    <p className="text-4xl font-serif text-gold-400">
                      ◎ {(Math.max(listing.price, listing.currentBid) / 1e9).toFixed(4)}
                    </p>
                    {listing.currentBid > 0 && (
                      <p className="text-gray-500 text-xs mt-2">
                        Leading bidder: {shortAddress(listing.highestBidder)}
                      </p>
                    )}
                  </div>
                )}
              </div>
            )}

            {isAuction && !isSettled && !isCancelled && !auctionEnded && listing && (
              <div className="bg-dark-800 border border-white/10 rounded-xl p-6 space-y-4">
                <p className="text-gold-400 text-sm font-medium uppercase tracking-wider">
                  Place Your Bid
                </p>
                <div className="space-y-3">
                  <div>
                    <label className="text-gray-400 text-xs mb-2 block">
                      Bid Amount (SOL)
                    </label>
                    <div className="flex items-center gap-2">
                      <span className="text-white text-lg">◎</span>
                      <input
                        type="number"
                        step="0.1"
                        min={
                          listing.currentBid > 0
                            ? (listing.currentBid + 0.1 * 1e9) / 1e9
                            : listing.price / 1e9
                        }
                        value={bidAmount}
                        onChange={(event) => setBidAmount(event.target.value)}
                        className="flex-1 bg-dark-900 border border-white/10 rounded-lg px-4 py-2.5 text-white text-sm focus:outline-none focus:border-gold-500 transition"
                        placeholder="0.00"
                      />
                    </div>
                    <p className="text-gray-500 text-xs mt-1">
                      Minimum: ◎{" "}
                      {listing.currentBid > 0
                        ? ((listing.currentBid + 0.1 * 1e9) / 1e9).toFixed(2)
                        : (listing.price / 1e9).toFixed(2)}
                    </p>
                  </div>

                  {bidAmount && (
                    <div className="bg-dark-900 border border-white/10 rounded-lg p-3 space-y-2 text-xs">
                      <div className="flex justify-between">
                        <span className="text-gray-400">Your Bid:</span>
                        <span className="text-gold-400 font-semibold">
                          ◎ {bidAmount}
                        </span>
                      </div>
                    </div>
                  )}

                  <button
                    onClick={() => {
                      void handlePlaceBid();
                    }}
                    disabled={!connected || !bidAmount || loadingAction}
                    className={`w-full py-3 rounded-lg font-semibold text-sm transition ${
                      !connected || !bidAmount || loadingAction
                        ? "bg-gray-700 text-gray-400 cursor-not-allowed"
                        : "bg-gold-500 hover:bg-gold-600 text-dark-900"
                    }`}
                  >
                    {loadingAction
                      ? "Placing Bid..."
                      : !connected
                        ? "Connect Wallet"
                        : "Place Bid"}
                  </button>
                </div>
              </div>
            )}

            {isFixedPrice && !isSettled && !isCancelled && (
              <button
                onClick={() => {
                  void handleBuyNow();
                }}
                disabled={!connected || loadingAction}
                className={`w-full py-4 rounded-lg font-semibold text-lg transition ${
                  !connected || loadingAction
                    ? "bg-gray-700 text-gray-400 cursor-not-allowed"
                    : "bg-gold-500 hover:bg-gold-600 text-dark-900"
                }`}
              >
                {loadingAction
                  ? "Processing..."
                  : !connected
                    ? "Connect Wallet to Buy"
                    : "Buy Now"}
              </button>
            )}

            {isAuction &&
              auctionEnded &&
              !isSettled &&
              !isCancelled &&
              listing &&
              listing.currentBid > 0 && (
                <button
                  onClick={() => {
                    void handleSettleAuction();
                  }}
                  disabled={loadingAction}
                  className={`w-full py-4 rounded-lg font-semibold text-lg transition ${
                    loadingAction
                      ? "bg-gray-700 text-gray-400 cursor-not-allowed"
                      : "bg-purple-600 hover:bg-purple-700 text-white"
                  }`}
                >
                  {loadingAction ? "Settling..." : "Settle Auction"}
                </button>
              )}

            {isAuction &&
              auctionEnded &&
              !isSettled &&
              !isCancelled &&
              listing &&
              listing.currentBid === 0 &&
              isSeller && (
                <div className="bg-yellow-900/30 border border-yellow-700/50 rounded-xl p-5 text-center">
                  <p className="text-yellow-200 font-semibold mb-1">
                    Auction ended with no bids
                  </p>
                  <p className="text-yellow-200/70 text-sm">
                    Cancel the listing to reclaim your NFT from escrow.
                  </p>
                </div>
              )}

            {isSeller &&
              !isSettled &&
              !isCancelled &&
              listing &&
              !(isAuction && !auctionEnded && listing.currentBid > 0) && (
                <div className="pt-4 border-t border-white/10">
                  <p className="text-gray-500 text-xs mb-3">
                    {isAuction && listing.currentBid > 0
                      ? "Cannot cancel after bids have been placed"
                      : isAuction && auctionEnded
                        ? "Cancel to return NFT to your wallet"
                        : "You can cancel this listing anytime"}
                  </p>
                  <button
                    onClick={() => {
                      void handleCancelListing();
                    }}
                    disabled={
                      (isAuction && listing.currentBid > 0) || loadingAction
                    }
                    className={`w-full py-2 rounded-lg font-semibold text-sm transition ${
                      (isAuction && listing.currentBid > 0) || loadingAction
                        ? "bg-gray-700 text-gray-400 cursor-not-allowed"
                        : "bg-red-900 hover:bg-red-800 text-red-100"
                    }`}
                  >
                    {loadingAction ? "Cancelling..." : "Cancel Listing"}
                  </button>
                </div>
              )}

            {isAuction && listing && (
              <div>
                <h2 className="font-serif text-2xl text-white mb-4">
                  Bid History
                </h2>
                <BidHistory
                  nftMint={mint}
                  connection={connection}
                  currentBid={listing.currentBid}
                  highestBidder={listing.highestBidder}
                />
              </div>
            )}

            {listing && (
              <div className="bg-dark-800 border border-white/10 rounded-xl p-6">
                <p className="text-gray-400 text-sm mb-2">Seller</p>
                <p className="text-white font-mono text-sm">
                  {shortAddress(listing.seller)}
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
