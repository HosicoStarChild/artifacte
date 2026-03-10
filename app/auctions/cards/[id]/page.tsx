"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import VerifiedBadge from "@/components/VerifiedBadge";
import { useWallet } from "@solana/wallet-adapter-react";
import { useConnection } from "@solana/wallet-adapter-react";
import { PublicKey, Transaction, SystemProgram, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { createTransferInstruction, getAssociatedTokenAddress } from "@solana/spl-token";
import dynamic from "next/dynamic";
import { showToast } from "@/components/ToastContainer";

const WalletMultiButton = dynamic(
  () => import("@solana/wallet-adapter-react-ui").then((m) => m.WalletMultiButton),
  { ssr: false }
);

const TREASURY = new PublicKey("DDSpvAK8DbuAdEaaBHkfLieLPSJVCWWgquFAA3pvxXoX");

export default function CardDetailPage() {
  const params = useParams();
  const cardId = params.id as string;
  const [card, setCard] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [buying, setBuying] = useState(false);
  const { publicKey, sendTransaction, connected } = useWallet();
  const { connection } = useConnection();

  useEffect(() => {
    if (!cardId) return;
    // Fetch all listings and find this card
    fetch(`/api/me-listings?perPage=10000`)
      .then(r => r.json())
      .then(data => {
        const found = (data.listings || []).find((l: any) => l.id === cardId || l.ccId === cardId.replace('cc-', ''));
        setCard(found || null);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [cardId]);

  const handleBuy = async () => {
    if (!connected || !publicKey || !card) return;
    setBuying(true);

    try {
      let tx: Transaction;

      if (card.currency === 'SOL') {
        const lamports = Math.round(card.price * LAMPORTS_PER_SOL);
        tx = new Transaction().add(
          SystemProgram.transfer({
            fromPubkey: publicKey,
            toPubkey: TREASURY,
            lamports,
          })
        );
      } else {
        const usdcMint = new PublicKey("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v");
        const tokenAmount = BigInt(Math.round(card.price * 1e6));
        const senderAta = await getAssociatedTokenAddress(usdcMint, publicKey);
        const treasuryAta = await getAssociatedTokenAddress(usdcMint, TREASURY);
        tx = new Transaction().add(
          createTransferInstruction(senderAta, treasuryAta, publicKey, tokenAmount)
        );
      }

      const sig = await sendTransaction(tx, connection);
      await connection.confirmTransaction(sig, "confirmed");

      try {
        await fetch('/api/cc-buy', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ccId: card.ccId,
            buyerWallet: publicKey.toBase58(),
            paymentSignature: sig,
          }),
        });
      } catch {}

      showToast.success(`✓ Payment confirmed! NFT will be transferred shortly. TX: ${sig.slice(0, 12)}...`);
    } catch (err: any) {
      if (err.message?.includes("User rejected")) {
        showToast.error("Transaction rejected");
      } else if (err.message?.includes("insufficient")) {
        showToast.error(`Insufficient balance`);
      } else {
        showToast.error(`Error: ${(err.message || "").slice(0, 80)}`);
      }
    } finally {
      setBuying(false);
    }
  };

  if (loading) {
    return (
      <div className="pt-24 pb-20 min-h-screen">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center py-20">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-2 border-gold-500 border-t-transparent mb-4"></div>
            <p className="text-gray-400">Loading card details...</p>
          </div>
        </div>
      </div>
    );
  }

  if (!card) {
    return (
      <div className="pt-24 pb-20 min-h-screen">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 text-center py-20">
          <h1 className="font-serif text-4xl text-white mb-4">Card Not Found</h1>
          <p className="text-gray-400 mb-8">This listing may have been sold or removed.</p>
          <Link href="/auctions/categories/tcg-cards" className="text-gold-500 hover:text-gold-400 font-medium">
            ← Browse TCG Cards
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="pt-24 pb-20 min-h-screen">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Breadcrumb */}
        <div className="mb-8">
          <Link href="/auctions/categories/tcg-cards" className="text-gold-500 hover:text-gold-400 text-sm font-medium transition">
            ← Back to {card.ccCategory || 'TCG Cards'}
          </Link>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
          {/* Left: Image */}
          <div className="bg-dark-800 rounded-xl border border-white/5 p-6 flex items-center justify-center">
            <img
              src={card.image}
              alt={card.name}
              className="max-h-[600px] w-auto object-contain rounded-lg"
            />
          </div>

          {/* Right: Details */}
          <div className="space-y-8">
            {/* Header */}
            <div>
              <div className="flex items-center gap-3 mb-3">
                <span className="text-gold-500 text-xs font-semibold tracking-widest uppercase">{card.ccCategory}</span>
                <VerifiedBadge collectionName={card.name} verifiedBy={card.verifiedBy} />
              </div>
              <h1 className="font-serif text-3xl md:text-4xl text-white mb-2">{card.name}</h1>
              <p className="text-gray-400 text-sm">{card.subtitle}</p>
            </div>

            {/* Price */}
            <div className="bg-dark-800 rounded-xl border border-white/5 p-6">
              <p className="text-gray-500 text-xs font-medium tracking-wider mb-2">Price</p>
              <div className="flex items-baseline gap-3 mb-4">
                <p className="text-white font-serif text-4xl">
                  {card.currency === 'SOL' ? `◎ ${card.price.toLocaleString()}` : `$${card.price.toLocaleString()}`}
                </p>
                <span className="text-gold-500 text-sm font-medium">{card.currency}</span>
              </div>
              {card.ccPrice && (
                <p className="text-gray-600 text-xs mb-4">
                  Original: {card.currency === 'SOL' ? `◎ ${card.ccPrice}` : `$${card.ccPrice.toLocaleString()}`} + 5% platform fee
                </p>
              )}

              {connected ? (
                <button
                  onClick={handleBuy}
                  disabled={buying}
                  className="w-full px-6 py-3.5 bg-gold-500 hover:bg-gold-600 disabled:opacity-50 text-dark-900 rounded-lg text-base font-semibold transition-colors duration-200"
                >
                  {buying ? "Processing..." : "Buy Now"}
                </button>
              ) : (
                <WalletMultiButton className="!w-full !bg-gold-500 hover:!bg-gold-600 !rounded-lg !h-12 !text-base !font-semibold" />
              )}
            </div>

            {/* Grading Info */}
            <div className="bg-dark-800 rounded-xl border border-white/5 p-6">
              <h3 className="text-white font-medium text-sm mb-4 tracking-wider uppercase">Grading Details</h3>
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
                {card.gradeNum !== undefined && (
                  <div>
                    <p className="text-gray-500 text-xs mb-1">Grade Number</p>
                    <p className="text-white text-sm font-medium">{card.gradeNum}</p>
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
                <p className="text-gray-400 text-xs leading-relaxed">
                  📦 Physical card securely stored at {card.vault || 'vault facility'}. After purchase, you own the NFT representing this card. To claim the physical card, redeem via{' '}
                  <a href="https://collectorcrypt.com" target="_blank" rel="noopener noreferrer" className="text-gold-500 hover:text-gold-400 underline">
                    Collector Crypt
                  </a>.
                </p>
              </div>
            </div>

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
                {card.ccId && (
                  <div>
                    <p className="text-gray-500 text-xs mb-1">Collector Crypt ID</p>
                    <p className="text-white text-xs font-mono">{card.ccId}</p>
                  </div>
                )}
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
                {card.ccUrl && (
                  <a
                    href={card.ccUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-gold-500 hover:text-gold-400 transition"
                  >
                    View on Collector Crypt →
                  </a>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
