"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import VerifiedBadge from "@/components/VerifiedBadge";
import { useWallet, useConnection } from "@solana/wallet-adapter-react";
import { PublicKey, Transaction, VersionedTransaction } from "@solana/web3.js";
import dynamic from "next/dynamic";
import { showToast } from "@/components/ToastContainer";
import PriceHistory from "@/components/PriceHistory";

const WalletMultiButton = dynamic(
  () => import("@solana/wallet-adapter-react-ui").then((m) => m.WalletMultiButton),
  { ssr: false }
);

// Fee collection happens on our auction program listings only (2% on-chain)
// CC card buys pass through to ME with no separate fee

export default function CardDetailPage() {
  const params = useParams();
  const cardId = params.id as string;
  const [card, setCard] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [buying, setBuying] = useState(false);
  const { publicKey, signTransaction, sendTransaction, connected } = useWallet();
  const { connection } = useConnection();

  useEffect(() => {
    if (!cardId) return;
    
    async function loadCard() {
      // First try: listing index (CC cards)
      try {
        const listRes = await fetch(`/api/me-listings?perPage=10000`);
        const data = await listRes.json();
        const found = (data.listings || []).find((l: any) => l.id === cardId || l.nftAddress === cardId || l.ccId === cardId.replace('cc-', ''));
        if (found) {
          setCard(found);
          setLoading(false);
          return;
        }
      } catch {}

      // Second try: direct Helius lookup (Artifacte-minted cards)
      try {
        const nftRes = await fetch(`/api/nft?mint=${cardId}`);
        if (nftRes.ok) {
          const nftData = await nftRes.json();
          const asset = nftData.result || nftData.nft;
          if (asset) {
            const attrs = asset.content?.metadata?.attributes || asset.attributes || [];
            const getAttr = (key: string) => attrs.find((a: any) => a.trait_type === key)?.value || "";
            const isArtifacte = asset.authorities?.some((a: any) => a.address === "DDSpvAK8DbuAdEaaBHkfLieLPSJVCWWgquFAA3pvxXoX");
            const ccCollection = asset.grouping?.find((g: any) => g.group_value === "CCryptWBYktukHDQ2vHGtVcmtjXxYzvw8XNVY64YN2Yf") || 
                                 asset.collection === "CCryptWBYktukHDQ2vHGtVcmtjXxYzvw8XNVY64YN2Yf";
            const isCC = !!ccCollection;
            
            if (isArtifacte) {
              setCard({
                id: asset.id || asset.mint || cardId,
                name: asset.content?.metadata?.name || asset.name || "Unknown",
                image: asset.content?.links?.image || asset.image || "",
                nftAddress: asset.id || asset.mint || cardId,
                category: "TCG_CARDS",
                source: "artifacte",
                grade: getAttr("Condition") === "Graded" ? `${getAttr("Grading Company")} ${getAttr("Grade")}` : getAttr("Condition"),
                gradeNum: getAttr("Grade") || null,
                gradingCompany: getAttr("Grading Company") || null,
                year: getAttr("Year"),
                ccCategory: getAttr("TCG"),
                variant: getAttr("Variant"),
                language: getAttr("Language"),
                cardName: getAttr("Card Name"),
                set: getAttr("Set"),
                cardNumber: getAttr("Card Number"),
                priceSource: getAttr("Price Source"),
                priceSourceId: getAttr("Price Source ID"),
                seller: asset.ownership?.owner,
                insuredValue: null,
                vault: null,
              });
              setLoading(false);
              return;
            }

            if (isCC) {
              const ccName = asset.content?.metadata?.name || asset.name || "Unknown";
              setCard({
                id: asset.id || asset.mint || cardId,
                name: ccName,
                image: asset.content?.links?.image || asset.image || "",
                nftAddress: asset.id || asset.mint || cardId,
                category: "TCG_CARDS",
                source: "collector-crypt",
                grade: `${getAttr("Grading Company")} ${getAttr("The Grade") || getAttr("GradeNum")}`.trim(),
                gradeNum: getAttr("GradeNum") || null,
                gradingCompany: getAttr("Grading Company") || null,
                year: getAttr("Year"),
                ccCategory: getAttr("Category"),
                insuredValue: getAttr("Insured Value") ? parseInt(getAttr("Insured Value")) : null,
                vault: getAttr("Vault"),
                seller: asset.ownership?.owner || (asset as any).owner,
                subtitle: `${getAttr("Category")} • ${getAttr("Grading Company")} ${getAttr("GradeNum")} • ${getAttr("Vault") || "Vault"}`,
              });
              setLoading(false);
              return;
            }
          }
        }
      } catch {}

      setLoading(false);
    }
    
    loadCard();
  }, [cardId]);

  const handleBuy = async () => {
    if (!connected || !publicKey || !card) return;
    if (!card.nftAddress) {
      showToast.error("NFT mint address not available");
      return;
    }
    setBuying(true);

    try {
      // Step 1: Get ME notary-cosigned transaction from our API
      showToast.info("Building transaction...");
      
      const buildRes = await fetch('/api/me-buy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mint: card.nftAddress,
          buyer: publicKey.toBase58(),
        }),
      });

      if (!buildRes.ok) {
        const errData = await buildRes.json();
        throw new Error(errData.error || 'Failed to build transaction');
      }

      const { v0Tx, legacyTx, price } = await buildRes.json();
      
      const txBase64 = v0Tx || legacyTx;
      if (!txBase64) throw new Error("No transaction returned from API");
      
      if (!signTransaction) {
        throw new Error("Wallet does not support signing");
      }

      showToast.info(`💳 Confirm purchase — ${price} SOL`);
      const txBytes = Uint8Array.from(atob(txBase64), c => c.charCodeAt(0));
      
      let sig: string;
      if (v0Tx) {
        const vTx = VersionedTransaction.deserialize(txBytes);
        const signed = await signTransaction(vTx as any);
        sig = await connection.sendRawTransaction((signed as any).serialize(), {
          skipPreflight: true,
          preflightCommitment: 'confirmed',
        });
      } else {
        const tx = Transaction.from(txBytes);
        const signed = await signTransaction(tx);
        sig = await connection.sendRawTransaction(signed.serialize());
      }
      
      showToast.info("⏳ Confirming purchase...");
      await connection.confirmTransaction(sig, "confirmed");
      showToast.success(`✅ NFT purchased! TX: ${sig.slice(0, 16)}...`);
    } catch (err: any) {
      if (err.message?.includes("User rejected") || err.message?.includes("user rejected")) {
        showToast.error("Transaction cancelled");
      } else if (err.message?.includes("insufficient")) {
        showToast.error("Insufficient SOL balance");
      } else if (err.message?.includes("no longer available") || err.message?.includes("already been sold")) {
        showToast.error("This item has already been sold");
      } else if (err.message?.includes("No active listing")) {
        showToast.error("This item is no longer listed");
      } else if (err.message?.includes("Simulation failed") || err.message?.includes("simulation failed")) {
        showToast.error("Transaction simulation failed. This listing may be stale — try refreshing the page.");
      } else {
        showToast.error(`Error: ${(err.message || "").slice(0, 120)}`);
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
          <button
            onClick={() => window.history.back()}
            className="text-gold-500 hover:text-gold-400 text-sm font-medium transition cursor-pointer"
          >
            ← Back to {card.category === 'MERCHANDISE' ? 'Merchandise' : card.category === 'SEALED' ? 'Sealed Product' : card.category === 'SPORTS_CARDS' ? 'Sports Cards' : 'TCG Cards'}
          </button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
          {/* Left: Image */}
          <div className="bg-dark-800 rounded-xl border border-white/5 p-6 flex items-start justify-center self-start lg:sticky lg:top-28">
            <img
              src={card.image}
              alt={card.name}
              className="max-h-[500px] w-auto object-contain rounded-lg"
              onError={(e) => { (e.target as HTMLImageElement).src = '/placeholder-card.svg'; }}
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
            {card.source === "artifacte" ? (
              <ArtifactePriceSection card={card} />
            ) : (
              <div className="bg-dark-800 rounded-xl border border-white/5 p-6">
                <p className="text-gray-500 text-xs font-medium tracking-wider mb-2">Price</p>
                <div className="flex items-baseline gap-3 mb-4">
                  <p className="text-white font-serif text-4xl">
                    {card.currency === 'SOL' ? `◎ ${card.price?.toLocaleString()}` : `$${card.price?.toLocaleString()}`}
                  </p>
                  <span className="text-gold-500 text-sm font-medium">{card.currency}</span>
                </div>

                <button
                  disabled
                  className="w-full px-6 py-3.5 bg-gray-600/50 cursor-not-allowed text-gray-400 rounded-lg text-base font-semibold"
                >
                  Buy Now — Coming Soon
                </button>
                <p className="text-gray-600 text-xs mt-2">Powered by Magic Eden</p>
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
                    <a href="https://collectorcrypt.com" target="_blank" rel="noopener noreferrer" className="text-gold-500 hover:text-gold-400 underline">
                      Collector Crypt
                    </a>.
                  </p>
                )}
              </div>
            </div>

            {/* Oracle Price History — skip for merchandise and TCGplayer-sourced cards */}
            {card.category !== 'MERCHANDISE' && card.priceSource !== 'TCGplayer' && (
            <PriceHistory 
              cardName={card.name} 
              category={card.category} 
              grade={card.gradingCompany && card.gradeNum ? `${card.gradingCompany} ${card.gradeNum}` : undefined}
              year={card.year}
              nftAddress={card.nftAddress}
            />
            )}
            {card.priceSource === 'TCGplayer' && card.priceSourceId && (
              <TcgPlayerPriceBox productId={card.priceSourceId} />
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

function TcgPlayerPriceBox({ productId }: { productId: string }) {
  const [price, setPrice] = useState<number | null>(null);

  useEffect(() => {
    fetch(`/api/tcgplayer-price?id=${productId}`)
      .then(r => r.json())
      .then(d => setPrice(d.marketPrice || d.listedMedianPrice || null))
      .catch(() => {});
  }, [productId]);

  return (
    <div className="bg-dark-800 rounded-xl border border-white/5 p-6">
      <h3 className="text-white font-medium text-sm mb-4 tracking-wider uppercase">Market Price</h3>
      <p className="text-white font-serif text-3xl font-bold mb-1">
        {price ? `$${price.toFixed(2)}` : "Loading..."}
      </p>
      <p className="text-gray-500 text-xs">Current market price per TCGplayer</p>
    </div>
  );
}

function ArtifactePriceSection({ card }: { card: any }) {
  const [marketPrice, setMarketPrice] = useState<number | null>(null);

  useEffect(() => {
    if (card.priceSource === "TCGplayer" && card.priceSourceId) {
      fetch(`/api/tcgplayer-price?id=${card.priceSourceId}`)
        .then(r => r.json())
        .then(d => setMarketPrice(d.marketPrice || d.listedMedianPrice || null))
        .catch(() => {});
    }
  }, [card.priceSource, card.priceSourceId]);

  return (
    <div className="bg-dark-800 rounded-xl border border-white/5 p-6">
      <p className="text-gray-500 text-xs font-medium tracking-wider mb-2">Market Price</p>
      <div className="flex items-baseline gap-3 mb-2">
        <p className="text-white font-serif text-4xl">
          {marketPrice ? `$${marketPrice.toFixed(2)}` : "—"}
        </p>
        {card.priceSource && (
          <span className="text-gold-500 text-xs font-medium">via {card.priceSource}</span>
        )}
      </div>
      <div className="mt-4 flex flex-wrap gap-3 text-xs text-gray-400">
        {card.variant && <span className="bg-dark-700 px-2 py-1 rounded">{card.variant}</span>}
        {card.language && <span className="bg-dark-700 px-2 py-1 rounded">{card.language}</span>}
        {card.grade && <span className="bg-dark-700 px-2 py-1 rounded">{card.grade}</span>}
        <span className="bg-dark-700 px-2 py-1 rounded">Artifacte Collection</span>
      </div>
    </div>
  );
}
