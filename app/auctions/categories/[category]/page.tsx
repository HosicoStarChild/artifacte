"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { auctions, listings as staticListings, formatFullPrice, categorySlugMap, categoryLabels, BAXUS_SELLER_FEE_ENABLED, BAXUS_SELLER_FEE_PERCENT, Listing } from "@/lib/data";
import AuctionCard from "@/components/AuctionCard";
import VerifiedBadge from "@/components/VerifiedBadge";
import { useWallet } from "@solana/wallet-adapter-react";
import { useConnection } from "@solana/wallet-adapter-react";
import { PublicKey, Transaction, SystemProgram, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { createTransferInstruction, getAssociatedTokenAddress } from "@solana/spl-token";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useAuctionProgram } from "@/hooks/useAuctionProgram";
import { AuctionProgram } from "@/lib/auction-program";
import { showToast } from "@/components/ToastContainer";

const WalletMultiButton = dynamic(
  () => import("@solana/wallet-adapter-react-ui").then((m) => m.WalletMultiButton),
  { ssr: false }
);

const TREASURY = new PublicKey("6drXw31FjHch4ixXa4ngTyUD2cySUs3mpcB2YYGA9g7P");
const TOKENS: Record<string, { mint: PublicKey; decimals: number; label: string }> = {
  USD1: { mint: new PublicKey("USD1ttGY1N17NEEHLmELoaybftRBUSErhqYiQzvEmuB"), decimals: 6, label: "USD1" },
  USDC: { mint: new PublicKey("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"), decimals: 6, label: "USDC" },
};

const categoryEmojis: Record<string, string> = {
  "artifacte": "✨",
  "digital-art": "🎨",
  "spirits": "🥃",
  "tcg-cards": "🃏",
  "sports-cards": "⚽",
  "watches": "⌚",
  "sealed": "📦",
  "merchandise": "🛍️",
};

export default function CategoryAuctionsPage() {
  const params = useParams();
  const categorySlug = params.category as string;
  const category = categorySlugMap[categorySlug];
  const [tab, setTab] = useState<"fixed" | "live">("fixed");
  const { publicKey, sendTransaction, signTransaction, connected, wallet } = useWallet();
  const { connection } = useConnection();
  const auctionProgram = useAuctionProgram();
  const [buyingId, setBuyingId] = useState<string | null>(null);
  const [currency, setCurrency] = useState<"USD1" | "USDC">("USD1");
  // URL search params (triggers re-render on change)
  const urlSearchParams = useSearchParams();
  const urlCcCategoryParam = urlSearchParams.get('ccCategory');
  // Restore filters from sessionStorage on mount, with URL param override
  const storageKey = `artifacte-filters-${categorySlug}`;
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [page, setPage] = useState(1);
  const [currencyFilter, setCurrencyFilter] = useState<"All" | "USDC" | "SOL">("All");
  const [sortBy, setSortBy] = useState<"default" | "price-high" | "price-low" | "newest">("default");
  const [searchInput, setSearchInput] = useState("");
  const [hydrated, setHydrated] = useState(false);

  // Restore state from sessionStorage/URL after hydration
  useEffect(() => {
    const reverseMap: Record<string, string> = {
      'Pokemon': 'Pokemon', 'One Piece': 'One Piece',
      'Yu-Gi-Oh': 'Yu-Gi-Oh', 'Dragon Ball': 'Dragon Ball Z', 'Lorcana': 'Lorcana',
      'Magic': 'Magic', 'Magic: The Gathering': 'Magic',
    };
    const urlCcCategory = new URLSearchParams(window.location.search).get('ccCategory');
    if (urlCcCategory) {
      const tcgVal = reverseMap[urlCcCategory] || urlCcCategory;
      setFilters({ tcg: tcgVal });
    } else {
      try { setFilters(JSON.parse(sessionStorage.getItem(storageKey) || '{}')); } catch {}
    }
    try { setPage(parseInt(sessionStorage.getItem(`${storageKey}-page`) || '1')); } catch {}
    try { setCurrencyFilter((sessionStorage.getItem(`${storageKey}-currency`) as any) || "All"); } catch {}
    try { setSortBy((sessionStorage.getItem(`${storageKey}-sort`) as any) || "default"); } catch {}
    try { setSearchInput(sessionStorage.getItem(`${storageKey}-search`) || ""); } catch {}
    setHydrated(true);
  }, [storageKey]);

  // Sync URL ccCategory param → filter state (handles navigation between carousels)
  useEffect(() => {
    if (!urlCcCategoryParam) return;
    const reverseMap: Record<string, string> = {
      'Pokemon': 'Pokemon', 'One Piece': 'One Piece',
      'Yu-Gi-Oh': 'Yu-Gi-Oh', 'Dragon Ball': 'Dragon Ball Z', 'Lorcana': 'Lorcana',
      'Magic': 'Magic', 'Magic: The Gathering': 'Magic',
    };
    const tcgVal = reverseMap[urlCcCategoryParam] || urlCcCategoryParam;
    if (filters.tcg !== tcgVal) {
      setFilters({ tcg: tcgVal });
      setPage(1);
    }
  }, [urlCcCategoryParam]);

  // Persist filters to sessionStorage on change
  useEffect(() => {
    try {
      sessionStorage.setItem(storageKey, JSON.stringify(filters));
      sessionStorage.setItem(`${storageKey}-page`, String(page));
      sessionStorage.setItem(`${storageKey}-currency`, currencyFilter);
      sessionStorage.setItem(`${storageKey}-sort`, sortBy);
      sessionStorage.setItem(`${storageKey}-search`, searchInput);
    } catch {}
  }, [filters, page, currencyFilter, sortBy, searchInput, storageKey]);
  const searchTimer = useRef<NodeJS.Timeout>();
  const ITEMS_PER_PAGE = 24;
  const [meListings, setMeListings] = useState<any[]>([]);
  const [meLoading, setMeLoading] = useState(true);
  const [meFilterLoading, setMeFilterLoading] = useState(false);
  const [meTotal, setMeTotal] = useState(0);

  // Fetch from ME API for TCG and Sports cards
  const isArtifacteCollection = category === "ARTIFACTE";
  const useMeApi = category === "TCG_CARDS" || category === "SPORTS_CARDS" || category === "SEALED" || category === "MERCHANDISE" || category === "SPIRITS" || isArtifacteCollection;

  useEffect(() => {
    if (!useMeApi || !category) return;
    // Only show full spinner on initial load; filter changes keep old results visible
    if (meListings.length === 0) setMeLoading(true);
    else setMeFilterLoading(true);
    // Artifacte collection queries the Artifacte on-chain program directly (not Oracle)
    const params = new URLSearchParams({
      ...(isArtifacteCollection ? {} : { category }),
      perPage: String(ITEMS_PER_PAGE),
      page: String(page),
      sort: sortBy === 'price-high' ? 'price-desc' : sortBy === 'price-low' ? 'price-asc' : 'price-desc',
    });
    // Pass filters to server
    const tcgFilter = filters['tcg'];
    if (tcgFilter && tcgFilter !== 'All') {
      const ccCatMap: Record<string, string> = {
        'pokemon': 'Pokemon',
        'one piece': 'One Piece',
        'yu-gi-oh': 'Yu-Gi-Oh,Yu-Gi-Oh!',
        'magic': 'Magic: The Gathering',
        'dragon ball z': 'Dragon Ball Z,Dragon Ball Super',
        'lorcana': 'Lorcana',
      };
      const mapped = ccCatMap[tcgFilter.toLowerCase()];
      if (mapped) params.set('ccCategory', mapped);
    }
    const gradeFilter = filters['grade'];
    if (gradeFilter && gradeFilter !== 'All') params.set('grade', gradeFilter);
    // Currency filter applied client-side after Tensor USDC enrichment — not sent to Oracle
    // Pass search query
    const searchFilter = filters['search'];
    if (searchFilter) params.set('q', searchFilter);
    // Additional filters
    const rarityFilter = filters['rarity'];
    if (rarityFilter && rarityFilter !== 'All') params.set('rarity', rarityFilter);
    const langFilter = filters['language'];
    if (langFilter && langFilter !== 'All') params.set('language', langFilter);
    const sportFilter = filters['sport'];
    if (sportFilter && sportFilter !== 'All') params.set('sport', sportFilter);
    const brandFilter = filters['brand'];
    if (brandFilter && brandFilter !== 'All') params.set('brand', brandFilter);
    const spiritFilter = filters['spiritType'];
    if (spiritFilter && spiritFilter !== 'All') params.set('spiritType', spiritFilter);
    const sourceFilter = filters['source'];
    if (sourceFilter && sourceFilter !== 'All') {
      const sourceMap: Record<string, string> = {
        'Collectors Crypt': 'collector-crypt',
        'Phygitals': 'phygitals',
      };
      params.set('source', sourceMap[sourceFilter] || sourceFilter);
    }

    const apiUrl = isArtifacteCollection
      ? `/api/artifacte-program-listings?${params}`
      : `/api/me-listings?${params}`;

    fetch(apiUrl)
      .then(r => r.json())
      .then(data => {
        setMeListings(data.listings || []);
        setMeTotal(data.total || 0);
        setMeLoading(false);
        setMeFilterLoading(false);
      })
      .catch(() => { setMeLoading(false); setMeFilterLoading(false); });
  }, [useMeApi, category, filters, currencyFilter, page, sortBy]);

  // Use ME listings for TCG/Sports, static for everything else
  const listings = useMeApi ? meListings : staticListings;

  // Category-specific filter options
  const categoryFilters: Record<string, { label: string; key: string; options: string[] }[]> = {
    TCG_CARDS: [
      { label: "Source", key: "source", options: ["All", "Collectors Crypt", "Phygitals"] },
      { label: "TCG", key: "tcg", options: ["All", "One Piece", "Pokemon", "Dragon Ball Z", "Magic", "Yu-Gi-Oh"] },
      { label: "Rarity", key: "rarity", options: ["All", "Common", "Rare", "Ultra Rare", "Secret Rare", "Alt Art", "Manga Alt Art"] },
      { label: "Grade", key: "grade", options: ["All", "PSA 10", "PSA 9", "PSA 8", "BGS 9.5", "BGS 10", "CGC 10", "CGC 9.5", "CGC 9", "CGC 8", "Ungraded"] },
      { label: "Language", key: "language", options: ["All", "EN", "JPN"] },
    ],
    SPIRITS: [
      { label: "Type", key: "spiritType", options: ["All", "Bourbon", "Rye", "Single Malt Whisky", "Blended Whisky", "American Whiskey", "Rum", "Tequila", "Cognac", "Wine"] },
    ],
    WATCHES: [
      { label: "Brand", key: "brand", options: ["All", "Rolex", "Patek Philippe", "Audemars Piguet", "Omega", "Cartier", "Hublot", "Richard Mille"] },
    ],
    SPORTS_CARDS: [
      { label: "Sport", key: "sport", options: ["All", "Baseball", "Basketball", "Football", "Soccer"] },
      { label: "Grade", key: "grade", options: ["All", "PSA 10", "PSA 9", "BGS 9.5", "BGS 10", "SGC 10"] },
      { label: "Brand", key: "brand", options: ["All", "Topps", "Panini", "Upper Deck"] },
    ],
    DIGITAL_ART: [
      { label: "Collection", key: "collection", options: ["All", "SMB Gen 2", "SMB Gen 3", "Claynosaurz", "Galactic Gecko", "Famous Fox Federation", "Mad Lads", "Sensei"] },
    ],
    SEALED: [
      { label: "TCG", key: "tcg", options: ["All", "Pokemon", "One Piece", "Dragon Ball Z", "Magic", "Yu-Gi-Oh"] },
    ],
  };

  const isDigitalArt = category === "DIGITAL_ART";

  const handleBuyNow = async (listingId: string, price: number, nftMint?: string, listing?: any) => {
    if (!connected || !publicKey) {
      showToast.error("Please connect your wallet first");
      return;
    }

    setBuyingId(listingId);
    try {
      let sig: string = "";

      // CC / ME-listed cards / Phygitals: buy via ME notary-cosigned transaction
      if (listing?.source === 'collector-crypt' || listing?.source === 'phygitals' || listing?.nftAddress) {
        const mintAddr = listing?.nftAddress || nftMint;
        if (!mintAddr) {
          showToast.error("NFT mint address not available");
          setBuyingId(null);
          return;
        }

        // Phygitals: always use Tensor directly
        if (listing?.source === 'phygitals' || listingId.startsWith('phyg-')) {
          if (!signTransaction) throw new Error("Wallet does not support signing");
          const { executeTensorBuy } = await import('@/lib/tensor-buy-client');
          const result = await executeTensorBuy(mintAddr, publicKey.toBase58(), signTransaction, showToast.info, sendTransaction ?? undefined, wallet?.adapter?.name);
          if (result.confirmed) {
            showToast.success(`✅ Card purchased for ${result.price} USDC!`);
          } else {
            showToast.info(`Transaction sent but not confirmed yet. Check Solscan.`);
          }
          setMeListings(prev => prev.filter((l: any) => l.mintAddress !== mintAddr && l.nftAddress !== mintAddr && l.id !== mintAddr && l.id !== listingId));
          setBuyingId(null);
          return;
        }

        // Card-category purchases stay in-app once they reach this flow.
        // Phygitals use Tensor above; the remaining card listings use ME below.
        showToast.info("Building transaction...");
        const buildRes = await fetch('/api/me-buy', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ mint: mintAddr, buyer: publicKey.toBase58() }),
        });

        if (!buildRes.ok) {
          const errData = await buildRes.json().catch(() => ({ error: 'Failed to build transaction' }));
          throw new Error(errData.error || 'Failed to build transaction');
        }

        const { v0Tx, v0TxSigned, legacyTx, price: mePrice, listingSource } = await buildRes.json();

        if (!signTransaction) throw new Error("Wallet does not support signing");
        showToast.info(`💳 Confirm purchase — ${mePrice} SOL`);

        const { VersionedTransaction } = await import('@solana/web3.js');

        const sendViaPoxy = async (rawTxBytes: Uint8Array): Promise<string> => {
          const b64 = Buffer.from(rawTxBytes).toString('base64');
          const res = await fetch('/api/rpc', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'sendTransaction', params: [b64, { skipPreflight: true, encoding: 'base64', maxRetries: 3 }] }),
          });
          const data = await res.json();
          if (data.error) throw new Error(data.error.message || JSON.stringify(data.error));
          return data.result;
        };

        // Pre-simulate with sigVerify:false before wallet signing.
        // Phantom internally simulates during signTransaction — multi-signer notary txs
        // fail Phantom's simulation without this step, showing "unable to safely predict" warning.
        const preSim = async (b64Tx: string) => {
          try {
            await fetch('/api/rpc', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'simulateTransaction', params: [b64Tx, { sigVerify: false, encoding: 'base64', commitment: 'processed' }] }),
            });
          } catch {}
        };

        if (v0TxSigned && v0Tx) {
          // Notary-cosigned flow (M2 CC cards)
          await preSim(v0TxSigned);
          const signedBytes = Uint8Array.from(atob(v0TxSigned), c => c.charCodeAt(0));
          const notaryTx = VersionedTransaction.deserialize(signedBytes);
          const signed = await signTransaction(notaryTx as any);
          sig = await sendViaPoxy((signed as any).serialize());
        } else if (v0Tx) {
          await preSim(v0Tx);
          const txBytes = Uint8Array.from(atob(v0Tx), c => c.charCodeAt(0));
          const vTx = VersionedTransaction.deserialize(txBytes);
          const signed = await signTransaction(vTx as any);
          sig = await sendViaPoxy((signed as any).serialize());
        } else if (legacyTx) {
          const txBytes = Uint8Array.from(atob(legacyTx), c => c.charCodeAt(0));
          const tx = Transaction.from(txBytes);
          const signed = await signTransaction(tx);
          sig = await sendViaPoxy(signed.serialize());
        } else {
          throw new Error("No transaction returned from API");
        }

        // Poll via HTTP proxy — WebSocket not supported on /api/rpc
        let ccConfirmed = false;
        for (let i = 0; i < 20; i++) {
          await new Promise(r => setTimeout(r, 3000));
          const statusRes = await fetch('/api/rpc', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'getSignatureStatuses', params: [[sig]] }),
          });
          if (statusRes.status === 429) continue;
          const statusData = await statusRes.json();
          const status = statusData.result?.value?.[0];
          if (status?.confirmationStatus === 'confirmed' || status?.confirmationStatus === 'finalized') {
            if (status.err) throw new Error('Transaction failed on-chain');
            ccConfirmed = true;
            break;
          }
        }
        if (ccConfirmed) {
          showToast.success(`✅ Card purchased! TX: ${sig.slice(0, 16)}...`);
        } else {
          showToast.info(`TX sent: ${sig.slice(0, 8)}... — check your wallet`);
        }
        setBuyingId(null);
        return;
      }

      // Use AuctionProgram if listing has nftMint (real on-chain listing)
      if (nftMint && auctionProgram) {
        try {
          const nftMintPubkey = new PublicKey(nftMint);
          const token = TOKENS[currency];
          
          // Get buyer's NFT account (where they'll receive the NFT)
          const buyerNftAccount = await getAssociatedTokenAddress(nftMintPubkey, publicKey);
          
          // Get seller from on-chain listing PDA
          const AUCTION_PROGRAM_ID = new PublicKey("81s1tEx4MPdVvqS6X84Mok5K4N5fMbRLzcsT5eo2K8J3");
          const [listingPda] = PublicKey.findProgramAddressSync(
            [Buffer.from("listing"), nftMintPubkey.toBuffer()],
            AUCTION_PROGRAM_ID
          );
          const listingInfo = await connection.getAccountInfo(listingPda);
          if (!listingInfo) throw new Error("On-chain listing not found");
          const sellerPubkey = new PublicKey(listingInfo.data.subarray(8, 40));

          // Get payment accounts
          const buyerPaymentAccount = await getAssociatedTokenAddress(token.mint, publicKey);
          const sellerPaymentAccount = await getAssociatedTokenAddress(token.mint, sellerPubkey);
          
          sig = await auctionProgram.buyNow(
            nftMintPubkey,
            sellerPaymentAccount,
            buyerPaymentAccount,
            buyerNftAccount,
            Math.round(price * (10 ** token.decimals)),
            token.mint
          );
        } catch (programErr: any) {
          // Fall back to direct transfer if program call fails
          console.warn("AuctionProgram.buyNow failed, falling back to direct transfer:", programErr);
          throw new Error(`On-chain purchase failed: ${programErr.message?.slice(0, 50)}`);
        }
      } else {
        // No on-chain listing found — cannot proceed
        throw new Error("This item is not available for purchase");
      }

      showToast.success(`✓ Purchase successful! TX: ${sig.slice(0, 12)}...`);
    } catch (err: any) {
      const message = err.message || "Transaction failed";
      
      if (message.includes("User rejected")) {
        showToast.error("Transaction rejected by user");
      } else if (message.includes("insufficient")) {
        showToast.error(`Insufficient balance. Required: ${price} ${isDigitalArt ? "SOL" : currency}`);
      } else {
        showToast.error(`Error: ${message.slice(0, 80)}`);
      }
    } finally {
      setBuyingId(null);
    }
  };

  // Filter auctions and listings by category
  const categoryAuctions = category ? auctions.filter((a) => a.category === category) : [];
  const categoryListingsBase = category
    ? (useMeApi ? meListings : listings.filter((l: any) => l.category === category))
    : [];

  // Apply dropdown filters — only for non-ME categories (ME categories filter server-side)
  // Currency filter + sort always applied client-side (Tensor USDC enrichment happens after Oracle returns)
  const categoryListings = (useMeApi ? categoryListingsBase : categoryListingsBase.filter((l: any) => {
    for (const [key, value] of Object.entries(filters)) {
      if (!value || value === "All") continue;
      if (key === "spiritType") {
        const st = (l.spirit_type || l.subtitle || "").toLowerCase();
        if (!st.includes(value.toLowerCase())) return false;
      } else if (key === "brand") {
        const name = (l.name || "").toLowerCase();
        const sub = (l.subtitle || "").toLowerCase();
        if (!name.includes(value.toLowerCase()) && !sub.includes(value.toLowerCase())) return false;
      } else if (key === "collection") {
        const sub = (l.subtitle || "").toLowerCase();
        if (!sub.includes(value.toLowerCase())) return false;
      }
    }
    return true;
  })).filter((l: any) => {
    if (currencyFilter === "All") return true;
    if (currencyFilter === "USDC") return !!(l.usdcPrice || l.currency === "USDC");
    if (currencyFilter === "SOL") return l.currency === "SOL" || !!(l.solPrice && l.solPrice > 0);
    return true;
  }).sort((a: any, b: any) => {
    if (sortBy === "price-high") return b.price - a.price;
    if (sortBy === "price-low") return a.price - b.price;
    if (sortBy === "newest") {
      const aId = a.id || '';
      const bId = b.id || '';
      return bId > aId ? 1 : -1;
    }
    return 0;
  });

  if (!category) {
    return (
      <div className="pt-24 pb-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center py-20">
            <h1 className="font-serif text-4xl text-white mb-4">Category Not Found</h1>
            <p className="text-gray-400 mb-8">The category you're looking for doesn't exist.</p>
            <Link href="/" className="text-gold-500 hover:text-gold-400 font-medium">
              ← Back to Home
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const categoryName = categoryLabels[category] || category;
  const emoji = categoryEmojis[categorySlug] || "🎯";

  return (
    <div className="pt-24 pb-20">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mb-12">
          <Link href="/" className="text-gold-500 hover:text-gold-400 text-sm font-medium transition mb-6 inline-block">
            ← Back to Home
          </Link>
          <div className="flex items-start gap-6 mb-6">
            <div className="text-6xl">{emoji}</div>
            <div>
              <p className="text-gold-500 text-xs font-semibold tracking-widest uppercase mb-3">Category</p>
              <h1 className="font-serif text-4xl md:text-5xl text-white mb-3">{categoryName}</h1>
              <p className="text-gray-400 text-base max-w-2xl">
                Discover authenticated {categoryName.toLowerCase()} tokenized on Solana. Bid on live auctions or purchase items at fixed prices.
              </p>
            </div>
          </div>
        </div>

        {/* Tabs & Filters */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6 mb-10 pb-8 border-b border-white/5">
          {/* Tabs — only show for on-chain categories (not ME-backed) */}
          {!useMeApi && (
          <div className="flex gap-3 bg-dark-800 rounded-lg p-1 border border-white/5">
            <button
              onClick={() => setTab("fixed")}
              className={`px-6 py-2.5 rounded-md text-sm font-medium transition-colors duration-200 ${
                tab === "fixed" ? "bg-gold-500 text-dark-900" : "text-gray-400 hover:text-white"
              }`}
            >
              Fixed Price
            </button>
            <button
              onClick={() => setTab("live")}
              className={`px-6 py-2.5 rounded-md text-sm font-medium transition-colors duration-200 ${
                tab === "live" ? "bg-gold-500 text-dark-900" : "text-gray-400 hover:text-white"
              }`}
            >
              Live Auctions
            </button>
          </div>
          )}

          {/* Currency Filter */}
          {category === "TCG_CARDS" || category === "SPORTS_CARDS" || category === "SEALED" || category === "MERCHANDISE" ? (
            <div className="flex items-center gap-3">
              <span className="text-gray-500 text-xs font-medium tracking-wider">Currency:</span>
              <div className="flex gap-2 bg-dark-800 rounded-lg p-1 border border-white/5">
                {(["All", "USDC", "SOL"] as const).map((c) => (
                  <button
                    key={c}
                    onClick={() => { setCurrencyFilter(c); setPage(1); }}
                    className={`px-4 py-2 rounded-md text-xs font-medium transition-colors duration-200 ${
                      currencyFilter === c ? "bg-gold-500 text-dark-900" : "text-gray-400 hover:text-white"
                    }`}
                  >
                    {c === "SOL" ? "◎ SOL" : c}
                  </button>
                ))}
              </div>
            </div>
          ) : isDigitalArt ? (
            <div className="flex items-center gap-3">
              <span className="text-gray-500 text-xs font-medium tracking-wider">Currency:</span>
              <span className="text-white text-sm font-medium bg-dark-800 px-4 py-2 rounded-lg border border-white/5">◎ SOL</span>
            </div>
          ) : (
            <div className="flex items-center gap-3">
              <span className="text-gray-500 text-xs font-medium tracking-wider">Currency:</span>
              <span className="text-white text-sm font-medium bg-dark-800 px-4 py-2 rounded-lg border border-white/5">USDC</span>
            </div>
          )}
        </div>

        {/* Search Bar */}
        <div className="mb-6">
          <div className="relative max-w-md">
            <input
              type="text"
              placeholder="Search by name, set, number..."
              value={searchInput}
              onChange={(e) => {
                const val = e.target.value;
                setSearchInput(val);
                clearTimeout(searchTimer.current);
                searchTimer.current = setTimeout(() => { setFilters(prev => ({ ...prev, search: val })); setPage(1); }, 400);
              }}
              className="w-full bg-dark-800 border border-white/10 text-white text-sm rounded-lg pl-10 pr-4 py-2.5 focus:border-gold-500 focus:outline-none transition-colors placeholder-gray-500"
            />
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </div>
        </div>

        {/* Category Filters */}
        {category && categoryFilters[category] && (
          <div className="flex flex-wrap gap-3 mb-8">
            {categoryFilters[category].map((filter) => (
              <div key={filter.key} className="relative">
                <select
                  value={filters[filter.key] || "All"}
                  onChange={(e) => { setFilters({ ...filters, [filter.key]: e.target.value }); setPage(1); }}
                  className="appearance-none bg-dark-800 border border-white/10 text-white text-sm rounded-lg px-4 py-2.5 pr-8 focus:border-gold-500 focus:outline-none transition-colors cursor-pointer hover:border-white/20"
                >
                  {filter.options.map((opt) => (
                    <option key={opt} value={opt} className="bg-dark-900">
                      {opt === "All" ? `${filter.label}: All` : opt}
                    </option>
                  ))}
                </select>
                <div className="absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none text-gray-500 text-xs">▼</div>
              </div>
            ))}
            {Object.values(filters).some((v) => v && v !== "All") && (
              <button
                onClick={() => { setFilters({}); setPage(1); }}
                className="text-gold-500 hover:text-gold-400 text-sm font-medium px-3 py-2 transition-colors"
              >
                Clear filters ✕
              </button>
            )}
          </div>
        )}

        {/* Sort */}
        <div className="flex items-center gap-3 mb-8">
          <span className="text-gray-500 text-xs font-medium tracking-wider">Sort:</span>
          <div className="relative">
            <select
              value={sortBy}
              onChange={(e) => { setSortBy(e.target.value as any); setPage(1); }}
              className="appearance-none bg-dark-800 border border-white/10 text-white text-sm rounded-lg px-4 py-2.5 pr-8 focus:border-gold-500 focus:outline-none transition-colors cursor-pointer hover:border-white/20"
            >
              <option value="default" className="bg-dark-900">Default</option>
              <option value="price-high" className="bg-dark-900">Price: High to Low</option>
              <option value="price-low" className="bg-dark-900">Price: Low to High</option>
              <option value="newest" className="bg-dark-900">Newest Listing</option>
            </select>
            <div className="absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none text-gray-500 text-xs">▼</div>
          </div>
        </div>

        {/* Fixed Price Tab */}
        {tab === "fixed" && (
          <>
            {meLoading && useMeApi ? (
              <div className="text-center py-20">
                <div className="inline-block animate-spin rounded-full h-8 w-8 border-2 border-gold-500 border-t-transparent mb-4"></div>
                <p className="text-gray-400">Loading listings from marketplace...</p>
              </div>
            ) : categoryListings.length > 0 ? (
              <>
              {(() => {
                const totalItems = useMeApi ? meTotal : categoryListings.length;
                const totalPages = Math.ceil(totalItems / ITEMS_PER_PAGE);
                return totalItems > ITEMS_PER_PAGE ? (
                <div className="flex items-center justify-between mb-6">
                  <p className="text-gray-400 text-sm">{totalItems.toLocaleString()} items</p>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => { setPage(Math.max(1, page - 1)); window.scrollTo(0, 0); }}
                      disabled={page === 1}
                      className="px-3 py-1.5 bg-dark-800 border border-white/10 rounded text-sm text-white disabled:opacity-30 hover:border-gold-500 transition"
                    >
                      ← Prev
                    </button>
                    <span className="text-gray-400 text-sm px-2">
                      Page {page} of {totalPages}
                    </span>
                    <button
                      onClick={() => { setPage(Math.min(totalPages, page + 1)); window.scrollTo(0, 0); }}
                      disabled={page >= totalPages}
                      className="px-3 py-1.5 bg-dark-800 border border-white/10 rounded text-sm text-white disabled:opacity-30 hover:border-gold-500 transition"
                    >
                      Next →
                    </button>
                  </div>
                </div>
              ) : null; })()}
              <div className={`grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8 transition-opacity duration-200 ${meFilterLoading ? 'opacity-40' : ''}`}>
                {(useMeApi ? categoryListings : categoryListings.slice((page - 1) * ITEMS_PER_PAGE, page * ITEMS_PER_PAGE)).map((l) => {
                  const usd1Amount = l.price.toLocaleString();
                  return (
                    <div
                      key={l.id}
                      className="bg-dark-800 rounded-lg border border-white/5 overflow-hidden card-hover group flex flex-col h-full"
                    >
                      {/* Image */}
                      <Link href={l.source === 'collector-crypt' ? `/auctions/cards/${l.id}` : l.source === 'phygitals' && (l as any).nftAddress ? `/auctions/cards/${l.id}` : l.source === 'artifacte' && (l as any).nftAddress ? `/auctions/cards/${(l as any).nftAddress}` : l.source === 'baxus' ? (l.externalUrl || `https://app.baxus.co/asset/${(l as any).nftAddress}`) : '#'} target={l.source === 'baxus' ? '_blank' : undefined} rel={l.source === 'baxus' ? 'noopener noreferrer' : undefined} className="block">
                      <div className="aspect-square overflow-hidden bg-dark-900 relative">
                        <img
                          src={l.image?.includes('arweave.net/') ? `/api/img-proxy?url=${encodeURIComponent(l.image)}` : l.image}
                          alt={l.name}
                          className={`w-full h-full ${l.source === 'collector-crypt' || l.source === 'phygitals' || l.source === 'artifacte' ? 'object-contain p-2' : 'object-cover'} group-hover:scale-105 transition duration-500`}
                          onError={(e) => { (e.target as HTMLImageElement).src = '/placeholder-card.svg'; }}
                          onLoad={(e) => { const img = e.target as HTMLImageElement; if (img.naturalWidth === 0) img.src = '/placeholder-card.svg'; }}
                        />
                        {l.source === 'phygitals' && (
                          <span className="absolute top-2 right-2 bg-violet-500/90 text-white text-[10px] font-bold px-2 py-0.5 rounded-full">
                            PHYGITALS
                          </span>
                        )}
                        {l.source === 'collector-crypt' && (
                          <span className="absolute top-2 right-2 bg-violet-500/90 text-white text-[10px] font-bold px-2 py-0.5 rounded-full">
                            COLLECTOR CRYPT
                          </span>
                        )}
                        {l.source === 'artifacte' && (
                          <span className="absolute top-2 right-2 bg-gold-500/90 text-dark-900 text-[10px] font-bold px-2 py-0.5 rounded-full">
                            ARTIFACTE
                          </span>
                        )}
                      </div>
                      </Link>
                      {/* Details */}
                      <div className="p-6 flex-1 flex flex-col justify-between">
                        <div>
                          <div className="flex items-center gap-2 mb-3">
                            <VerifiedBadge collectionName={l.name} verifiedBy={l.source === 'phygitals' ? 'TCGplayer' : l.verifiedBy} />
                          </div>
                          <h3 className="text-white font-medium text-base mb-1">{l.name}</h3>
                          <p className="text-gray-500 text-xs mb-1">{l.subtitle}</p>
                          <p className="text-gray-600 text-xs mb-4">{categoryName}</p>
                        </div>
                        <div className="space-y-4">
                          <div>
                            <p className="text-gray-500 text-xs font-medium tracking-wider mb-1">Price</p>
                            {isDigitalArt ? (
                              <>
                                <p className="text-white font-serif text-2xl">◎ {l.price.toLocaleString()}</p>
                                <p className="text-gold-500 text-xs mt-1">SOL</p>
                              </>
                            ) : (l as any).usdcPrice || (l as any).currency === 'USDC' ? (
                              <>
                                <p className="text-white font-serif text-2xl">${((l as any).usdcPrice || l.price).toLocaleString()} <span className="text-gold-500 text-sm">USDC</span></p>
                                {(l as any).solPrice > 0 && (
                                  <p className="text-gray-500 text-xs mt-0.5">◎ {Number((l as any).solPrice).toLocaleString(undefined, { maximumFractionDigits: 4 })} SOL</p>
                                )}
                              </>
                            ) : (l as any).solPrice > 0 || (l as any).currency === 'SOL' ? (
                              <>
                                <p className="text-white font-serif text-2xl">◎ {((l as any).solPrice || l.price).toLocaleString(undefined, { maximumFractionDigits: 4 })}</p>
                                <p className="text-gold-500 text-xs mt-1">SOL</p>
                              </>
                            ) : (
                              <>
                                <p className="text-white font-serif text-2xl">{formatFullPrice(l.price)}</p>
                                <p className="text-gold-500 text-xs mt-1">
                                  {usd1Amount} USDC
                                </p>
                                {BAXUS_SELLER_FEE_ENABLED && l.verifiedBy === "BAXUS" && (
                                  <p className="text-gray-500 text-xs mt-1">+ {BAXUS_SELLER_FEE_PERCENT}% seller fee</p>
                                )}
                              </>
                            )}
                          </div>
                          {l.source === 'baxus' && (l.externalUrl || (l as any).nftAddress) ? (
                            <a
                              href={l.externalUrl || `https://app.baxus.co/asset/${(l as any).nftAddress}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="w-full px-4 py-2.5 bg-gold-500 hover:bg-gold-600 text-dark-900 rounded-lg text-sm font-semibold transition-colors duration-200 text-center block"
                            >
                              Buy on BAXUS
                            </a>
                          ) : l.source === 'artifacte' && (l as any).nftAddress ? (
                            <Link
                              href={`/auctions/cards/${(l as any).nftAddress}`}
                              className="w-full px-4 py-2.5 bg-gold-500 hover:bg-gold-600 text-dark-900 rounded-lg text-sm font-semibold transition-colors duration-200 text-center block"
                            >
                              View Details
                            </Link>
                          ) : (l.source === 'phygitals' || l.source === 'collector-crypt') && (l as any).nftAddress ? (
                            connected ? (
                              <button
                                onClick={() => handleBuyNow(l.id, (l as any).solPrice || l.price, (l as any).nftAddress, l)}
                                disabled={buyingId === l.id}
                                className="w-full px-4 py-2.5 bg-gold-500 hover:bg-gold-600 disabled:opacity-50 text-dark-900 rounded-lg text-sm font-semibold transition-colors duration-200"
                              >
                                {buyingId === l.id ? "Processing..." : `Buy Now`}
                              </button>
                            ) : (
                              <WalletMultiButton className="w-full !bg-gold-500 hover:!bg-gold-600 !text-dark-900 !rounded-lg !text-sm !font-semibold !h-10 !justify-center" />
                            )
                          ) : useMeApi ? (
                            <button
                              disabled
                              className="w-full px-4 py-2.5 bg-gray-600/50 cursor-not-allowed text-gray-400 rounded-lg text-sm font-semibold"
                            >
                              Coming Soon
                            </button>
                          ) : connected ? (
                            <button
                              onClick={() => handleBuyNow(l.id, l.price, (l as any).nftMint, l)}
                              disabled={buyingId === l.id}
                              className="w-full px-4 py-2.5 bg-gold-500 hover:bg-gold-600 disabled:opacity-50 text-dark-900 rounded-lg text-sm font-semibold transition-colors duration-200"
                            >
                              {buyingId === l.id ? "Processing..." : "Buy Now"}
                            </button>
                          ) : (
                            <WalletMultiButton className="!w-full !bg-gold-500 hover:!bg-gold-600 !rounded-lg !h-10 !text-sm !font-semibold" />
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
              {(() => {
                const totalItems = useMeApi ? meTotal : categoryListings.length;
                const totalPages = Math.ceil(totalItems / ITEMS_PER_PAGE);
                return totalItems > ITEMS_PER_PAGE ? (
                <div className="flex items-center justify-center gap-2 mt-10">
                  <button
                    onClick={() => { setPage(Math.max(1, page - 1)); window.scrollTo(0, 0); }}
                    disabled={page === 1}
                    className="px-4 py-2 bg-dark-800 border border-white/10 rounded text-sm text-white disabled:opacity-30 hover:border-gold-500 transition"
                  >
                    ← Prev
                  </button>
                  <span className="text-gray-400 text-sm px-4">
                    Page {page} of {totalPages}
                  </span>
                  <button
                    onClick={() => { setPage(Math.min(totalPages, page + 1)); window.scrollTo(0, 0); }}
                    disabled={page >= totalPages}
                    className="px-4 py-2 bg-dark-800 border border-white/10 rounded text-sm text-white disabled:opacity-30 hover:border-gold-500 transition"
                  >
                    Next →
                  </button>
                </div>
              ) : null; })()}
              </>
            ) : (
              <div className="text-center py-20">
                <p className="text-gray-400 text-lg mb-4">No fixed price items available in this category</p>
                <Link href="/" className="text-gold-500 hover:text-gold-400 font-medium">
                  Home →
                </Link>
              </div>
            )}
          </>
        )}

        {/* Live Auctions Tab */}
        {tab === "live" && (
          <>
            {categoryAuctions.length > 0 ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-8">
                {categoryAuctions.map((a) => (
                  <AuctionCard key={a.id} auction={a} />
                ))}
              </div>
            ) : (
              <div className="text-center py-20">
                <p className="text-gray-400 text-lg mb-4">No live auctions available in this category</p>
                <Link href="/" className="text-gold-500 hover:text-gold-400 font-medium">
                  Home →
                </Link>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
