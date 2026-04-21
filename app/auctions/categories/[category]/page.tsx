"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { auctions, listings as staticListings, categorySlugMap, categoryLabels, getListingPurchaseCurrency, resolveListingDisplayPrice, type Listing } from "@/lib/data";
import AuctionCard from "@/components/AuctionCard";
import { MarketplaceListingCard } from "@/components/MarketplaceListingCard";
import dynamic from "next/dynamic";
import Link from "next/link";
import { getExternalMarketplaceTotalPrice } from "@/lib/external-purchase-fees";

const CategoryListingPurchaseAction = dynamic(
  () => import("@/components/category/CategoryListingPurchaseAction"),
  {
    ssr: false,
    loading: () => (
      <button
        disabled
        className="w-full px-4 py-2.5 bg-gray-600/50 cursor-not-allowed text-gray-400 rounded-lg text-sm font-semibold"
      >
        Loading...
      </button>
    ),
  }
);

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

const ITEMS_PER_PAGE = 24;

const REVERSE_TCG_CATEGORY_MAP: Record<string, string> = {
  Pokemon: "Pokemon",
  "One Piece": "One Piece",
  "Yu-Gi-Oh": "Yu-Gi-Oh",
  "Dragon Ball": "Dragon Ball Z",
  Lorcana: "Lorcana",
  Magic: "Magic",
  "Magic: The Gathering": "Magic",
};

const SERVER_TCG_CATEGORY_MAP: Record<string, string> = {
  pokemon: "Pokemon",
  "one piece": "One Piece",
  "yu-gi-oh": "Yu-Gi-Oh,Yu-Gi-Oh!",
  magic: "Magic: The Gathering",
  "dragon ball z": "Dragon Ball Z,Dragon Ball Super",
  lorcana: "Lorcana",
};

const SOURCE_FILTER_MAP: Record<string, string> = {
  "Collectors Crypt": "collector-crypt",
  Phygitals: "phygitals",
};

type CategoryMarketplaceListing = Listing & {
  mintAddress?: string;
};

const CATEGORY_FILTERS: Record<string, { label: string; key: string; options: string[] }[]> = {
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

function buildListingsQueryParams({
  category,
  currencyFilter,
  filters,
  isArtifacteCollection,
  page,
  sortBy,
}: {
  category: string;
  currencyFilter: "All" | "USDC" | "SOL";
  filters: Record<string, string>;
  isArtifacteCollection: boolean;
  page: number;
  sortBy: "default" | "price-high" | "price-low" | "newest";
}) {
  const params = new URLSearchParams({
    ...(isArtifacteCollection ? {} : { category }),
    perPage: String(ITEMS_PER_PAGE),
    page: String(page),
    sort: sortBy === "newest"
      ? "newest"
      : sortBy === "price-high"
        ? "price-desc"
        : sortBy === "price-low"
          ? "price-asc"
          : "price-desc",
  });

  if (currencyFilter !== "All") params.set("displayCurrency", currencyFilter);

  const tcgFilter = filters.tcg;
  if (tcgFilter && tcgFilter !== "All") {
    const mapped = SERVER_TCG_CATEGORY_MAP[tcgFilter.toLowerCase()];
    if (mapped) params.set("ccCategory", mapped);
  }

  const forwardedFilterKeys = ["grade", "search", "rarity", "language", "sport", "brand", "spiritType"] as const;
  for (const key of forwardedFilterKeys) {
    const value = filters[key];
    if (!value || value === "All") continue;
    params.set(key === "search" ? "q" : key, value);
  }

  const sourceFilter = filters.source;
  if (sourceFilter && sourceFilter !== "All") {
    params.set("source", SOURCE_FILTER_MAP[sourceFilter] || sourceFilter);
  }

  return params;
}

function getListingHref(listing: CategoryMarketplaceListing): string {
  if (listing.source === "collector-crypt") return `/auctions/cards/${listing.id}`;
  if (listing.source === "phygitals" && listing.nftAddress) return `/auctions/cards/${listing.id}`;
  if (listing.source === "artifacte" && listing.nftAddress) return `/auctions/cards/${listing.nftAddress}`;
  if (listing.externalUrl) return listing.externalUrl;
  return "#";
}

function getListingSourceBadge(listing: CategoryMarketplaceListing) {
  if (listing.source === "phygitals") {
    return {
      label: "PHYGITALS",
      className: "bg-violet-500/90 text-white",
    };
  }

  if (listing.source === "collector-crypt") {
    return {
      label: "COLLECTOR CRYPT",
      className: "bg-violet-500/90 text-white",
    };
  }

  if (listing.source === "artifacte") {
    return {
      label: "ARTIFACTE",
      className: "bg-gold-500/90 text-dark-900",
    };
  }

  return undefined;
}

function getListingImageFit(listing: CategoryMarketplaceListing): "contain" | "cover" {
  return listing.source === "collector-crypt" || listing.source === "phygitals" || listing.source === "artifacte"
    ? "contain"
    : "cover";
}

function CategoryAuctionsPageContent() {
  const params = useParams();
  const categorySlug = params.category as string;
  const category = categorySlugMap[categorySlug];
  const [tab, setTab] = useState<"fixed" | "live">("fixed");
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
    const urlCcCategory = new URLSearchParams(window.location.search).get('ccCategory');
    if (urlCcCategory) {
      const tcgVal = REVERSE_TCG_CATEGORY_MAP[urlCcCategory] || urlCcCategory;
      setFilters({ tcg: tcgVal });
      setPage(1);
    } else {
      try { setFilters(JSON.parse(sessionStorage.getItem(storageKey) || '{}')); } catch {}
      try { setPage(parseInt(sessionStorage.getItem(`${storageKey}-page`) || '1')); } catch {}
    }
    try { setCurrencyFilter((sessionStorage.getItem(`${storageKey}-currency`) as any) || "All"); } catch {}
    try { setSortBy((sessionStorage.getItem(`${storageKey}-sort`) as any) || "default"); } catch {}
    try { setSearchInput(sessionStorage.getItem(`${storageKey}-search`) || ""); } catch {}
    setHydrated(true);
  }, [storageKey]);

  // Sync URL ccCategory param → filter state (handles navigation between carousels)
  useEffect(() => {
    if (!hydrated || !urlCcCategoryParam) return;
    const tcgVal = REVERSE_TCG_CATEGORY_MAP[urlCcCategoryParam] || urlCcCategoryParam;
    setFilters((prev) => {
      if (prev.tcg === tcgVal && Object.keys(prev).length === 1) {
        return prev;
      }
      return { tcg: tcgVal };
    });
    setPage(1);
  }, [hydrated, urlCcCategoryParam]);

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
  const searchTimer = useRef<NodeJS.Timeout>(undefined);
  const listingsRequestRef = useRef(0);
  const [meListings, setMeListings] = useState<CategoryMarketplaceListing[]>([]);
  const [meLoading, setMeLoading] = useState(true);
  const [meFilterLoading, setMeFilterLoading] = useState(false);
  const [meTotal, setMeTotal] = useState(0);

  useEffect(() => {
    return () => {
      clearTimeout(searchTimer.current);
    };
  }, []);

  // Fetch from ME API for TCG and Sports cards
  const isArtifacteCollection = category === "ARTIFACTE";
  const useMeApi = category === "TCG_CARDS" || category === "SPORTS_CARDS" || category === "SEALED" || category === "MERCHANDISE" || category === "SPIRITS" || isArtifacteCollection;

  const handleListingPurchased = (listingId: string, nftAddress?: string) => {
    setMeListings((prev) => prev.filter((listing) => (
      listing.id !== listingId &&
      listing.id !== nftAddress &&
      listing.nftAddress !== nftAddress &&
      listing.mintAddress !== nftAddress
    )));
  };

  useEffect(() => {
    if (!hydrated || !useMeApi || !category) return;
    let cancelled = false;
    const abortController = new AbortController();
    const requestId = ++listingsRequestRef.current;
    const requestedPage = page;

    // Only show full spinner on initial load; filter changes keep old results visible
    if (meListings.length === 0) setMeLoading(true);
    else setMeFilterLoading(true);

    const params = buildListingsQueryParams({
      category,
      currencyFilter,
      filters,
      isArtifacteCollection,
      page,
      sortBy,
    });

    const apiUrl = isArtifacteCollection
      ? `/api/artifacte-program-listings?${params}`
      : `/api/me-listings?${params}`;

    fetch(apiUrl, { signal: abortController.signal })
      .then(async (response) => {
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(data.error || data.message || 'Failed to fetch listings');
        }
        return data;
      })
      .then(data => {
        if (cancelled || listingsRequestRef.current !== requestId) {
          return;
        }

        const total = Number(data.total) || 0;
        const totalPages = Math.max(1, Math.ceil(total / ITEMS_PER_PAGE));
        if (total > 0 && requestedPage > totalPages) {
          setMeTotal(total);
          setPage(totalPages);
          return;
        }

  setMeListings(Array.isArray(data.listings) ? (data.listings as CategoryMarketplaceListing[]) : []);
        setMeTotal(total);
        setMeLoading(false);
        setMeFilterLoading(false);
      })
      .catch((error) => {
        if (error?.name === 'AbortError') {
          return;
        }
        if (cancelled || listingsRequestRef.current !== requestId) {
          return;
        }
        setMeLoading(false);
        setMeFilterLoading(false);
      });

    return () => {
      cancelled = true;
      abortController.abort();
    };
  }, [hydrated, useMeApi, category, filters, currencyFilter, page, sortBy, isArtifacteCollection]);

  // Use ME listings for TCG/Sports, static for everything else
  const listings = useMeApi ? meListings : staticListings;

  const isDigitalArt = category === "DIGITAL_ART";

  // Filter auctions and listings by category
  const categoryAuctions = category ? auctions.filter((a) => a.category === category) : [];
  const categoryListingsBase = category
    ? (useMeApi ? meListings : listings.filter((listing) => listing.category === category))
    : [];

  // Apply dropdown filters — only for non-ME categories (ME categories filter server-side)
  // Currency filter + sort always applied client-side (Tensor USDC enrichment happens after Oracle returns)
  const categoryListings = useMeApi ? categoryListingsBase : categoryListingsBase.filter((listing) => {
    for (const [key, value] of Object.entries(filters)) {
      if (!value || value === "All") continue;
      if (key === "spiritType") {
        const st = (listing.spirit_type || listing.subtitle || "").toLowerCase();
        if (!st.includes(value.toLowerCase())) return false;
      } else if (key === "brand") {
        const name = (listing.name || "").toLowerCase();
        const sub = (listing.subtitle || "").toLowerCase();
        if (!name.includes(value.toLowerCase()) && !sub.includes(value.toLowerCase())) return false;
      } else if (key === "collection") {
        const sub = (listing.subtitle || "").toLowerCase();
        if (!sub.includes(value.toLowerCase())) return false;
      }
    }
    return true;
  }).filter((listing) => {
    if (currencyFilter === "All") return true;
    const purchaseCurrency = getListingPurchaseCurrency(listing);
    if (currencyFilter === "USDC") return purchaseCurrency === "USDC";
    if (currencyFilter === "SOL") return purchaseCurrency === "SOL";
    return true;
  }).sort((a, b) => {
    const aTotal = getExternalMarketplaceTotalPrice(resolveListingDisplayPrice(a).amount, { source: a.source });
    const bTotal = getExternalMarketplaceTotalPrice(resolveListingDisplayPrice(b).amount, { source: b.source });
    if (sortBy === "price-high") return bTotal - aTotal;
    if (sortBy === "price-low") return aTotal - bTotal;
    if (sortBy === "newest") {
      const aId = a.id || '';
      const bId = b.id || '';
      return bId > aId ? 1 : -1;
    }
    return 0;
  });

  const totalItems = useMeApi ? meTotal : categoryListings.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / ITEMS_PER_PAGE));

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
              className="w-full bg-dark-800 border border-white/10 text-white text-sm rounded-lg pl-10 pr-4 py-2.5 focus:border-gold-500 focus:outline-hidden transition-colors placeholder-gray-500"
            />
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </div>
        </div>

        {/* Category Filters */}
        {category && CATEGORY_FILTERS[category] && (
          <div className="flex flex-wrap gap-3 mb-8">
            {CATEGORY_FILTERS[category].map((filter) => (
              <div key={filter.key} className="relative">
                <select
                  value={filters[filter.key] || "All"}
                  onChange={(e) => { setFilters({ ...filters, [filter.key]: e.target.value }); setPage(1); }}
                  className="appearance-none bg-dark-800 border border-white/10 text-white text-sm rounded-lg px-4 py-2.5 pr-8 focus:border-gold-500 focus:outline-hidden transition-colors cursor-pointer hover:border-white/20"
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
              className="appearance-none bg-dark-800 border border-white/10 text-white text-sm rounded-lg px-4 py-2.5 pr-8 focus:border-gold-500 focus:outline-hidden transition-colors cursor-pointer hover:border-white/20"
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
              {totalItems > ITEMS_PER_PAGE ? (
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
              ) : null}
              <div className={`grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8 transition-opacity duration-200 ${meFilterLoading ? 'opacity-40' : ''}`}>
                {(useMeApi ? categoryListings : categoryListings.slice((page - 1) * ITEMS_PER_PAGE, page * ITEMS_PER_PAGE)).map((l) => {
                  const purchaseCurrency = getListingPurchaseCurrency(l);
                  const displayPrice = resolveListingDisplayPrice(l);
                  const totalDisplayPrice = getExternalMarketplaceTotalPrice(displayPrice.amount, {
                    source: l.source,
                  });
                  const formattedAmount = displayPrice.currency === 'SOL'
                    ? totalDisplayPrice.toLocaleString(undefined, { maximumFractionDigits: 4 })
                    : totalDisplayPrice.toLocaleString();
                  return (
                    <MarketplaceListingCard
                      key={l.id}
                      href={getListingHref(l)}
                      external={Boolean(l.externalUrl)}
                      imageSrc={l.image}
                      imageAlt={l.name}
                      title={l.name}
                      subtitle={l.subtitle}
                      meta={categoryName}
                      verifiedBy={l.source === 'phygitals' ? 'TCGplayer' : l.verifiedBy}
                      priceLabel={
                        isDigitalArt
                          ? `◎ ${l.price.toLocaleString()}`
                          : purchaseCurrency === 'SOL'
                            ? `◎ ${formattedAmount}`
                            : `$${formattedAmount}`
                      }
                      currencyLabel={isDigitalArt ? 'SOL' : displayPrice.currency}
                      sourceBadge={getListingSourceBadge(l)}
                      imageFit={getListingImageFit(l)}
                      imageSizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                      action={
                        <CategoryListingPurchaseAction
                          listing={l}
                          useMeApi={useMeApi}
                          isDigitalArt={isDigitalArt}
                          onPurchased={handleListingPurchased}
                        />
                      }
                    />
                  );
                })}
              </div>
              {totalItems > ITEMS_PER_PAGE ? (
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
              ) : null}
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

function CategoryAuctionsPageFallback() {
  return (
    <div className="pt-24 pb-20 min-h-screen">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center py-20">
        <p className="text-gray-400">Loading category...</p>
      </div>
    </div>
  );
}

export default function CategoryAuctionsPage() {
  return (
    <Suspense fallback={<CategoryAuctionsPageFallback />}>
      <CategoryAuctionsPageContent />
    </Suspense>
  );
}
