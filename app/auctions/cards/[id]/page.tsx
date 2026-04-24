"use client";

import { Suspense, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";

import { HomeImage } from "@/components/home/HomeImage";
import VerifiedBadge from "@/components/VerifiedBadge";
import { useConnection } from "@solana/wallet-adapter-react";
import { PublicKey, VersionedTransaction } from "@solana/web3.js";
import dynamic from "next/dynamic";
import { showToast } from "@/components/ToastContainer";
import { Card } from "@/components/ui/card";
import { useAuctionProgram } from "@/hooks/useAuctionProgram";
import { useWalletCapabilities } from "@/hooks/useWalletCapabilities";
import {
  getTransactionErrorMessage,
  isTransactionRequestRejected,
  TRANSACTION_REQUEST_REJECTED_MESSAGE,
} from "@/lib/client/transaction-errors";
import PriceHistory from "@/components/PriceHistory";
import { resolveListingDisplayPrice, resolveListingPayablePrice } from "@/lib/data";
import { isTensorMarketplaceListing } from "@/lib/marketplace-routing";

import { ArtifactePriceSection, TcgPlayerPriceBox } from "./_components/card-price-sections";
import { CardDetailLoadingState, CardDetailNotFoundState } from "./_components/card-detail-states";
import {
  fetchAuctionListing,
  formatListingQuote,
  getCardBackHref,
  getCardBackLabel,
  loadCardDetail,
  resolveCardImageSrc,
  type CardDetail,
} from "./_lib/card-detail";

const WalletMultiButton = dynamic(
  () => import("@solana/wallet-adapter-react-ui").then((m) => m.WalletMultiButton),
  { ssr: false }
);

function CardDetailPageContent() {
  const params = useParams<{ id: string }>();
  const cardId = params.id;
  const [card, setCard] = useState<CardDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [buying, setBuying] = useState(false);
  const [unlisting, setUnlisting] = useState(false);
  const { publicKey, signTransaction, sendTransaction, connected, walletName } = useWalletCapabilities();
  const { connection } = useConnection();
  const auctionProgram = useAuctionProgram();

  useEffect(() => {
    if (!cardId) {
      return;
    }

    let cancelled = false;

    void loadCardDetail(cardId, connection)
      .then((nextCard) => {
        if (cancelled) {
          return;
        }

        setCard(nextCard);
        setLoading(false);
      })
      .catch((error) => {
        console.error("[card-detail] Failed to load card", error);
        if (cancelled) {
          return;
        }

        setCard(null);
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [cardId, connection]);

  const handleBuy = async () => {
    if (!connected || !publicKey || !card) return;
    if (!card.nftAddress) {
      showToast.error("NFT mint address not available");
      return;
    }
    setBuying(true);
    const cardDisplayPrice = resolveListingDisplayPrice(card);
    const cardPayablePrice = resolveListingPayablePrice(card, {
      collectionName: card.collection,
    });

    try {
      showToast.info("Building transaction...");

      // Anchor auction program listings: buy directly via on-chain program
      if (card.auctionListing) {
        if (!signTransaction) throw new Error("Wallet does not support signing");
        if (!auctionProgram) throw new Error("Auction program unavailable");
        const { getAssociatedTokenAddress } = await import('@solana/spl-token');
        const nftMintPk = new PublicKey(card.nftAddress);
        const paymentMintPk = new PublicKey(
          card.auctionListing.currency === 'SOL' ? 'So11111111111111111111111111111111111111112'
          : card.auctionListing.currency === 'USD1' ? 'USD1ttGY1N17NEEHLmELoaybftRBUSErhqYiQzvEmuB'
          : 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'
        );
        const decimals = card.auctionListing.currency === 'SOL' ? 9 : 6;
        const priceInUnits = Math.round(card.auctionListing.price * Math.pow(10, decimals));
        const buyerNftAccount = await getAssociatedTokenAddress(nftMintPk, publicKey);
        const buyerPaymentAccount = await getAssociatedTokenAddress(paymentMintPk, publicKey);
        const sellerPk = new PublicKey(card.auctionListing.seller);
        const sellerPaymentAccount = await getAssociatedTokenAddress(paymentMintPk, sellerPk);
        showToast.info(`💳 Confirm purchase — ${card.auctionListing.currency === 'SOL' ? '◎' : '$'}${card.auctionListing.price.toLocaleString()} ${card.auctionListing.currency}`);
        const sig = await auctionProgram.buyNow(
          nftMintPk, sellerPaymentAccount, buyerPaymentAccount,
          buyerNftAccount, priceInUnits, paymentMintPk
        );
        showToast.success(`✅ NFT purchased! TX: ${sig.slice(0, 16)}...`);
        setCard((prevCard) => prevCard ? { ...prevCard, sold: true } : prevCard);
        setBuying(false);
        return;
      }

      // Route Tensor listings to Tensor buy flow (phyg- prefix or source/buyKind)
      const isTensorBuy = isTensorMarketplaceListing(card);
      if (isTensorBuy) {
        if (!signTransaction) throw new Error("Wallet does not support signing");
        const { executeTensorBuy } = await import('@/lib/tensor-buy-client');
        const result = await executeTensorBuy(
          card.nftAddress,
          publicKey.toBase58(),
          signTransaction,
          showToast.info,
          sendTransaction ?? undefined,
          walletName ?? undefined,
          {
            source: card.source,
            collectionName: card.collection,
          },
          true
        );
        if (result.confirmed) {
          showToast.success(`✅ Card purchased for ${formatListingQuote(result.totalPrice, result.currency)}!`);
        } else {
          showToast.info(`Transaction sent but not confirmed yet. Check Solscan.`);
        }
        setCard((prevCard) => prevCard ? { ...prevCard, sold: true } : prevCard);
        setBuying(false);
        return;
      }

      if (!signTransaction) throw new Error("Wallet does not support signing");

      const { executeMagicEdenBuy } = await import('@/lib/client/magic-eden-buy-client');
      const result = await executeMagicEdenBuy({
        mint: card.nftAddress,
        buyer: publicKey.toBase58(),
        source: card.source,
        collectionName: card.collection,
        signTransaction,
        listingDisplayPrice: cardDisplayPrice,
        onStatus: showToast.info,
      });

      if (result.confirmed) {
        showToast.success(`✅ NFT purchased! TX: ${result.sig.slice(0, 16)}...`);
      } else {
        showToast.info(`⏳ TX sent: ${result.sig.slice(0, 8)}... — check your wallet in a moment`);
      }
      setCard((prevCard) => prevCard ? { ...prevCard, sold: true } : prevCard);
    } catch (error) {
      const message = getTransactionErrorMessage(error, "");
      const lowerMessage = message.toLowerCase();

      if (isTransactionRequestRejected(error)) {
        showToast.error(TRANSACTION_REQUEST_REJECTED_MESSAGE);
      } else if (lowerMessage.includes("insufficient")) {
        const requiredAmount = card.auctionListing ? card.auctionListing.price : cardPayablePrice.amount;
        const requiredCurrency = card.auctionListing ? card.auctionListing.currency : cardPayablePrice.currency;
        showToast.error(`Insufficient balance. Required: ${formatListingQuote(requiredAmount, requiredCurrency)}`);
      } else if (lowerMessage.includes("no longer available") || lowerMessage.includes("already been sold")) {
        showToast.error("This item has already been sold");
      } else if (message.includes("No active listing")) {
        showToast.error("This item is no longer listed");
      } else if (lowerMessage.includes("simulation failed")) {
        showToast.error("Transaction simulation failed. This listing may be stale — try refreshing the page.");
      } else {
        showToast.error(`Error: ${message.slice(0, 120)}`);
      }
    } finally {
      setBuying(false);
    }
  };

  const handleUnlist = async () => {
    if (!connected || !publicKey || !card?.nftAddress || !signTransaction) return;
    setUnlisting(true);
    try {
      showToast.info("Building delist transaction...");

      // Check if listed on Anchor auction program first
      const nftMintPk = new PublicKey(card.nftAddress);
      const auctionListing = await fetchAuctionListing(connection, card.nftAddress);
      if (auctionListing) {
        // Cancel via Anchor auction program
        if (!auctionProgram) throw new Error("Auction program unavailable");
        const { getAssociatedTokenAddress } = await import('@solana/spl-token');
        const sellerNftAccount = await getAssociatedTokenAddress(nftMintPk, publicKey);
        const sig = await auctionProgram.cancelListing(nftMintPk, sellerNftAccount);
        showToast.success(`NFT unlisted successfully! TX: ${sig.slice(0, 12)}...`);
        setCard((prevCard) => prevCard ? { ...prevCard, price: 0, usdcPrice: null, solPrice: 0, auctionListing: null } : prevCard);
        setUnlisting(false);
        return;
      }

      // Detect NFT type to choose the correct Tensor delist route
      let delistRoute = '/api/tensor-delist'; // default: compressed
      try {
        const nftRes = await fetch(`/api/nft?mint=${card.nftAddress}`);
        const nftData = await nftRes.json();
        const rawAsset = nftData.result || {};
        const isCompressed = rawAsset.compression?.compressed === true;
        if (isCompressed) {
          delistRoute = '/api/tensor-delist';
        } else {
          const mintInfo = await connection.getAccountInfo(new PublicKey(card.nftAddress));
          const isToken2022 = mintInfo?.owner.toBase58() === 'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb';
          if (isToken2022) {
            delistRoute = '/api/tensor-delist-t22';
          } else {
            delistRoute = '/api/tensor-delist-legacy';
          }
        }
        console.log('[delist] route:', delistRoute, 'compressed:', isCompressed);
      } catch {
        // If detection fails, try compressed (original behavior)
      }

      const res = await fetch(delistRoute, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mint: card.nftAddress,
          owner: publicKey.toBase58(),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to build delist transaction');

      const txBytes = Buffer.from(data.tx, 'base64');
      const vtx = VersionedTransaction.deserialize(txBytes);
      const signed = await signTransaction(vtx);
      const sig = await connection.sendRawTransaction(signed.serialize());

      // Poll for confirmation
      for (let i = 0; i < 60; i++) {
        const status = await connection.getSignatureStatuses([sig]);
        const s = status.value[0];
        if (s?.confirmationStatus === 'confirmed' || s?.confirmationStatus === 'finalized') break;
        if (s?.err) throw new Error(`Transaction failed: ${JSON.stringify(s.err)}`);
        await new Promise(r => setTimeout(r, 500));
      }

      showToast.success("NFT unlisted successfully!");
      setCard((prevCard) => prevCard ? { ...prevCard, price: 0, usdcPrice: null, solPrice: 0 } : prevCard);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to unlist";
      console.error("Unlist failed:", error);
      showToast.error(message);
    } finally {
      setUnlisting(false);
    }
  };

  if (loading) {
    return <CardDetailLoadingState />;
  }

  if (!card) {
    return <CardDetailNotFoundState backHref="/auctions/categories/tcg-cards" backLabel="TCG Cards" />;
  }

  const payablePrice = resolveListingPayablePrice(card, {
    collectionName: card.collection,
  });
  const primaryPrice = card.auctionListing ? card.auctionListing.price : payablePrice.amount;
  const primaryCurrency = card.auctionListing ? card.auctionListing.currency : payablePrice.currency;
  const buyPrice = card.auctionListing ? card.auctionListing.price : primaryPrice;
  const buyCurrency = primaryCurrency;
  const formattedPrimaryAmount = primaryCurrency === 'SOL'
    ? primaryPrice.toLocaleString(undefined, { maximumFractionDigits: 4 })
    : primaryPrice.toLocaleString();

  const marketplaceLabel = card.auctionListing
    ? 'Listed on Artifacte'
    : isTensorMarketplaceListing(card)
      ? 'Powered by Tensor'
      : 'Powered by Magic Eden';
  const backHref = getCardBackHref(card.category);
  const backLabel = getCardBackLabel(card.category);

  return (
    <div className="pt-24 pb-20 min-h-screen">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Breadcrumb */}
        <div className="mb-8">
          <Link href={backHref} className="text-gold-500 hover:text-gold-400 text-sm font-medium transition">
            ← Back to {backLabel}
          </Link>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
          {/* Left: Image */}
          <div className="self-start lg:sticky lg:top-28">
            <Card className="overflow-hidden border-white/5 bg-dark-800 py-0">
              <div className="relative aspect-square bg-dark-900">
                <HomeImage
                  src={resolveCardImageSrc(card.image)}
                  alt={card.name}
                  sizes="(max-width: 1024px) 100vw, 50vw"
                  contain
                  className="p-6"
                />
              </div>
            </Card>
          </div>

          {/* Right: Details */}
          <div className="space-y-8">
            {/* Header */}
            <div>
              <div className="flex items-center gap-3 mb-3">
                <span className="text-gold-500 text-xs font-semibold tracking-widest uppercase">{card.ccCategory}</span>
                <VerifiedBadge collectionName={card.name} verifiedBy={card.verifiedBy} />
                {card.collection && (
                  <span className="px-2 py-0.5 rounded-full bg-gold-500/10 border border-gold-500/30 text-gold-400 text-xs font-semibold tracking-wide">
                    {card.collection}
                  </span>
                )}
              </div>
              <h1 className="font-serif text-3xl md:text-4xl text-white mb-2">{card.name}</h1>
              <p className="text-gray-400 text-sm">{card.subtitle}</p>
            </div>

            {/* Price */}
            {card.source === "artifacte" ? (
              <ArtifactePriceSection card={card} />
            ) : (
              <div className="bg-dark-800 rounded-xl border border-white/5 p-6">
                <p className="text-gray-500 text-xs font-medium tracking-wider mb-2">
                  {card.auctionListing?.listingType === 'auction' ? 'Auction' : card.price ? "Price" : "Status"}
                </p>
                {card.price ? (
                  <>
                    <div className="flex items-baseline gap-3">
                      <p className="text-white font-serif text-4xl">
                        {primaryCurrency === 'SOL' ? `◎ ${formattedPrimaryAmount}` : `$${formattedPrimaryAmount}`}
                      </p>
                      <span className="text-gold-500 text-sm font-medium">{primaryCurrency}</span>
                    </div>
                    {card.auctionListing?.listingType === 'auction' && card.auctionListing.currentBid > 0 && (
                      <p className="text-gold-400 text-sm mt-1">
                        Current bid: {card.auctionListing.currency === 'SOL' ? '◎ ' : '$'}{card.auctionListing.currentBid.toLocaleString()} {card.auctionListing.currency}
                      </p>
                    )}
                    {card.auctionListing?.listingType === 'auction' && card.auctionListing.endTime > 0 && (
                      <p className="text-gray-400 text-sm mt-1 mb-4">
                        Ends: {new Date(card.auctionListing.endTime).toLocaleDateString()} {new Date(card.auctionListing.endTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </p>
                    )}
                  </>
                ) : (
                  <p className="text-white font-serif text-4xl mb-4">Unlisted</p>
                )}

                {!card.price && card.auctionListing?.stale && connected && publicKey && card.auctionListing.seller === publicKey.toBase58() && (
                  <button
                    onClick={async () => {
                      if (!signTransaction || !card.nftAddress) return;
                      setUnlisting(true);
                      try {
                        showToast.info("Closing stale listing...");
                        if (!auctionProgram) throw new Error("Auction program unavailable");
                        const sig = await auctionProgram.closeStaleListing(new PublicKey(card.nftAddress));
                        showToast.success(`Stale listing closed! TX: ${sig.slice(0, 12)}...`);
                        setCard((prevCard) => prevCard ? { ...prevCard, auctionListing: null } : prevCard);
                      } catch (error) {
                        const message = error instanceof Error ? error.message : "Failed to close listing";
                        showToast.error(message.slice(0, 80));
                      } finally {
                        setUnlisting(false);
                      }
                    }}
                    disabled={unlisting}
                    className={`w-full px-6 py-3 rounded-lg text-sm font-semibold transition ${
                      unlisting ? "bg-gray-600/50 cursor-not-allowed text-gray-400" : "bg-dark-700 border border-yellow-500/30 text-yellow-500 hover:bg-yellow-500/10"
                    }`}
                  >
                    {unlisting ? "Closing..." : "Close Stale Listing (reclaim rent)"}
                  </button>
                )}

                {card.price ? (
                  connected && publicKey && card.seller && publicKey.toBase58() === card.seller ? (
                    <div className="space-y-3">
                      <div className="w-full px-6 py-3 rounded-lg text-sm font-semibold bg-dark-700 border border-gold-500/30 text-gold-500 text-center">
                        Your Listing
                      </div>
                      <button
                        onClick={handleUnlist}
                        disabled={unlisting}
                        className={`w-full px-6 py-3.5 rounded-lg text-base font-semibold transition ${
                          unlisting
                            ? "bg-gray-600/50 cursor-not-allowed text-gray-400"
                            : "bg-red-600 hover:bg-red-700 text-white"
                        }`}
                      >
                        {unlisting ? "Unlisting..." : "Unlist Item"}
                      </button>
                    </div>
                  ) : card.auctionListing ? (
                    connected ? (
                      <button
                        onClick={handleBuy}
                        disabled={buying || card.sold}
                        className={`w-full px-6 py-3.5 rounded-lg text-base font-semibold transition ${
                          buying || card.sold
                            ? "bg-gray-600/50 cursor-not-allowed text-gray-400"
                            : "bg-gold-500 hover:bg-gold-600 text-dark-900"
                        }`}
                      >
                        {card.sold ? "✅ Sold" : buying ? "Processing..." : card.auctionListing.listingType === 'auction' ? 'Place Bid' : `Buy Now — ${formatListingQuote(buyPrice, buyCurrency)}`}
                      </button>
                    ) : (
                      <WalletMultiButton className="w-full bg-gold-500! text-dark-900! rounded-lg! text-base! font-semibold! py-3.5!" />
                    )
                  ) : connected ? (
                    <button
                      onClick={handleBuy}
                      disabled={buying || card.sold}
                      className={`w-full px-6 py-3.5 rounded-lg text-base font-semibold transition ${
                        buying || card.sold
                          ? "bg-gray-600/50 cursor-not-allowed text-gray-400"
                          : "bg-gold-500 hover:bg-gold-600 text-dark-900"
                      }`}
                    >
                      {card.sold ? "✅ Sold" : buying ? "Processing..." : `Buy Now — ${formatListingQuote(buyPrice, buyCurrency)}`}
                    </button>
                  ) : (
                    <WalletMultiButton className="w-full bg-gold-500! text-dark-900! rounded-lg! text-base! font-semibold! py-3.5!" />
                  )
                ) : (
                  <p className="text-gray-500 text-sm">This item is not currently listed for sale</p>
                )}
                {card.price && <p className="text-gray-600 text-xs mt-2">{marketplaceLabel}</p>}
              </div>
            )}

            {/* Grading Info */}
            <div className="bg-dark-800 rounded-xl border border-white/5 p-6">
              <h3 className="text-white font-medium text-sm mb-4 tracking-wider uppercase">{card.source === "artifacte" && card.condition !== "Graded" ? "Card Details" : "Grading Details"}</h3>
              <div className="grid grid-cols-2 gap-4">
                {card.gradingCompany && (
                  <div>
                    <p className="text-gray-500 text-xs mb-1">Grading Company</p>
                    <p className="text-white text-sm font-medium">{card.gradingCompany}</p>
                  </div>
                )}
                {card.grade && (
                  <div>
                    <p className="text-gray-500 text-xs mb-1">Grade</p>
                    <p className="text-white text-sm font-medium">{card.grade}</p>
                  </div>
                )}
                {(card.gradeNum !== undefined || card.source === "artifacte") && (
                  <div>
                    <p className="text-gray-500 text-xs mb-1">Grade Number</p>
                    <p className="text-white text-sm font-medium">{card.gradeNum || (card.condition === "Graded" ? card.grade : "Ungraded")}</p>
                  </div>
                )}
                {card.year && (
                  <div>
                    <p className="text-gray-500 text-xs mb-1">Year</p>
                    <p className="text-white text-sm font-medium">{card.year}</p>
                  </div>
                )}
                {card.gradingId && (
                  <div className="col-span-2">
                    <p className="text-gray-500 text-xs mb-1">Certificate #</p>
                    <div className="flex items-center gap-3">
                      <p className="text-white text-sm font-mono">{card.gradingId}</p>
                      {card.gradingCompany === 'PSA' && (
                        <a
                          href={`https://www.psacard.com/cert/${card.gradingId}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-gold-500 hover:text-gold-400 transition"
                        >
                          Verify on PSA →
                        </a>
                      )}
                      {(card.gradingCompany === 'BGS' || card.gradingCompany === 'BVG') && (
                        <a
                          href={`https://www.beckett.com/grading/card-lookup/${card.gradingId}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-gold-500 hover:text-gold-400 transition"
                        >
                          Verify on Beckett →
                        </a>
                      )}
                      {card.gradingCompany === 'CGC' && (
                        <a
                          href={`https://www.cgccards.com/certlookup/${card.gradingId}/`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-gold-500 hover:text-gold-400 transition"
                        >
                          Verify on CGC →
                        </a>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Vault / Custody */}
            <div className="bg-dark-800 rounded-xl border border-white/5 p-6">
              <h3 className="text-white font-medium text-sm mb-4 tracking-wider uppercase">Vault & Custody</h3>
              <div className="space-y-3">
                {card.vault && (
                  <div>
                    <p className="text-gray-500 text-xs mb-1">Stored At</p>
                    <p className="text-white text-sm font-medium">{card.vault}</p>
                  </div>
                )}
                {card.vaultLocation && (
                  <div>
                    <p className="text-gray-500 text-xs mb-1">Location</p>
                    <p className="text-white text-sm font-medium">{card.vaultLocation}</p>
                  </div>
                )}
                {card.insuredValue && (
                  <div>
                    <p className="text-gray-500 text-xs mb-1">Insured Value</p>
                    <p className="text-white text-sm font-medium">${card.insuredValue.toLocaleString()}</p>
                  </div>
                )}
              </div>
              <div className="mt-4 pt-4 border-t border-white/5">
                {card.source === "artifacte" ? (
                  <p className="text-gray-400 text-xs leading-relaxed">
                    📦 Physical card securely stored and custodied by <span className="text-gold-500 font-medium">Artifacte</span>. After purchase, you own the NFT representing this card. To claim the physical card, contact Artifacte for redemption.
                  </p>
                ) : (
                  <p className="text-gray-400 text-xs leading-relaxed">
                    📦 Physical card securely stored at {card.vault || 'vault facility'}. After purchase, you own the NFT representing this card. To claim the physical card, redeem via{' '}
                    {card.source === 'phygitals' ? (
                      <a href="https://phygitals.io" target="_blank" rel="noopener noreferrer" className="text-gold-500 hover:text-gold-400 underline">
                        Phygitals
                      </a>
                    ) : (
                      <a href="https://collectorcrypt.com" target="_blank" rel="noopener noreferrer" className="text-gold-500 hover:text-gold-400 underline">
                        Collector Crypt
                      </a>
                    )}.
                  </p>
                )}
              </div>
            </div>

            {/* Phygitals: show TCGplayer price box */}
            {card.source === 'phygitals' && card.priceSourceId && (
              <TcgPlayerPriceBox productId={card.priceSourceId} />
            )}
            {/* CC cards with TCGplayer source: show TCGplayer price box */}
            {card.source !== 'phygitals' && card.priceSource === 'TCGplayer' && card.priceSourceId && (
              <TcgPlayerPriceBox productId={card.priceSourceId} />
            )}
            {/* Oracle Price History — CC, Sports, Phygitals */}
            {card.category !== 'MERCHANDISE' && (
            <PriceHistory 
              cardName={card.name} 
              category={card.category} 
              grade={card.gradingCompany && card.gradeNum ? `${card.gradingCompany} ${card.gradeNum}` : undefined}
              year={card.year ?? undefined}
              nftAddress={card.nftAddress}
              source={card.source}
              tcgPlayerId={card.tcgPlayerId || card.priceSourceId}
              gradingId={card.gradingId || undefined}
              gradingCompany={card.gradingCompany ?? undefined}
              priceSource={card.priceSource}
              priceSourceId={card.priceSourceId}
            />
            )}

            {/* NFT Details */}
            <div className="bg-dark-800 rounded-xl border border-white/5 p-6">
              <h3 className="text-white font-medium text-sm mb-4 tracking-wider uppercase">NFT Details</h3>
              <div className="space-y-3">
                {card.nftAddress && (
                  <div>
                    <p className="text-gray-500 text-xs mb-1">Mint Address</p>
                    <p className="text-white text-xs font-mono break-all">{card.nftAddress}</p>
                  </div>
                )}
{/* CC ID removed */}
                {card.seller && (
                  <div>
                    <p className="text-gray-500 text-xs mb-1">Seller</p>
                    <p className="text-white text-xs font-mono break-all">{card.seller}</p>
                  </div>
                )}
              </div>
              <div className="mt-4 flex gap-3">
                {card.nftAddress && (
                  <a
                    href={`https://explorer.solana.com/address/${card.nftAddress}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-gold-500 hover:text-gold-400 transition"
                  >
                    View on Explorer →
                  </a>
                )}
{/* CC link removed */}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function CardDetailPageFallback() {
  return (
    <div className="pt-24 pb-20 min-h-screen">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 text-center py-20">
        <p className="text-gray-400">Loading card...</p>
      </div>
    </div>
  );
}

export default function CardDetailPage() {
  return (
    <Suspense fallback={<CardDetailPageFallback />}>
      <CardDetailPageContent />
    </Suspense>
  );
}
