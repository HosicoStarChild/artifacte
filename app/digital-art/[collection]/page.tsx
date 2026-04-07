"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useWallet } from "@solana/wallet-adapter-react";

type MarketplaceSource = "magiceden" | "tensor";

const PLACEHOLDER_IMAGE =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='400' height='400'%3E%3Crect width='400' height='400' fill='%231e1e1e'/%3E%3Ctext x='50%25' y='50%25' dominant-baseline='middle' text-anchor='middle' font-size='48' fill='%23444'%3E%3F%3C/text%3E%3C/svg%3E";

interface CollectionInfo {
  collectionAddress: string;
  name: string;
  image: string;
  supply?: number;
  description?: string;
  links?: {
    website?: string;
    twitter?: string;
    discord?: string;
  };
  marketplaces?: {
    magicEden?: { symbol: string };
    tensor?: { slug: string };
    order?: Array<"artifacte" | "magiceden" | "tensor">;
  };
}

interface ListedNFT {
  id: string;
  nftMint: string;
  nftName: string;
  nftImage: string;
  price: number;
  listingType: "fixed" | "auction";
  seller: string;
  status: string;
  endTime?: number;
  currentBid?: number;
}

interface UserNFT {
  mint: string;
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
  buyKind: string;
  marketplaceUrl?: string;
}

function dedupeListings(
  listings: ExternalMarketplaceListing[]
): ExternalMarketplaceListing[] {
  const seen = new Set<string>();
  return listings.filter((listing) => {
    if (seen.has(listing.id)) return false;
    seen.add(listing.id);
    return true;
  });
}

function formatMarketplaceSource(source: MarketplaceSource): string {
  return source === "magiceden" ? "Magic Eden" : "Tensor";
}

function formatMarketplacePrice(price: number, currencySymbol: string): string {
  if (currencySymbol === "SOL") {
    return `◎ ${price.toLocaleString(undefined, {
      minimumFractionDigits: price < 1 ? 2 : 0,
      maximumFractionDigits: 4,
    })}`;
  }

  return `${price.toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })} ${currencySymbol}`;
}

function formatListedAt(listedAt?: number): string | null {
  if (!listedAt) return null;

  const diff = Date.now() - listedAt;
  if (diff < 60_000) return "just now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return `${Math.floor(diff / 86_400_000)}d ago`;
}

export default function CollectionPage() {
  const params = useParams();
  const collectionAddress = params.collection as string;
  const { publicKey } = useWallet();

  const dataRequestRef = useRef(0);
  const marketplaceRequestRef = useRef(0);
  const sortDropdownRef = useRef<HTMLDivElement>(null);

  const [collection, setCollection] = useState<CollectionInfo | null>(null);
  const [listings, setListings] = useState<ListedNFT[]>([]);
  const [userNFTs, setUserNFTs] = useState<UserNFT[]>([]);
  const [marketplaceListings, setMarketplaceListings] = useState<
    ExternalMarketplaceListing[]
  >([]);
  const [marketplaceCursor, setMarketplaceCursor] = useState<string | null>(null);
  const [hasMoreMarketplace, setHasMoreMarketplace] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMarketplace, setLoadingMarketplace] = useState(false);
  const [loadingMoreMarketplace, setLoadingMoreMarketplace] = useState(false);
  const [marketplaceError, setMarketplaceError] = useState("");
  const [showUserNFTs, setShowUserNFTs] = useState(false);
  const [sourceFilter, setSourceFilter] = useState<"all" | "magiceden" | "tensor">("all");
  const [sortOrder, setSortOrder] = useState<"price_asc" | "price_desc" | "recently_listed" | "common_to_rare" | "rare_to_common">("price_asc");
  const [sortOpen, setSortOpen] = useState(false);

  const walletAddress = publicKey?.toBase58();
  const hasMarketplaceConfig = Boolean(
    collection?.marketplaces?.magicEden?.symbol || collection?.marketplaces?.tensor?.slug
  );
  const hasMagicEden = Boolean(collection?.marketplaces?.magicEden?.symbol);
  const hasTensor = Boolean(collection?.marketplaces?.tensor?.slug);

  const filteredListings = (() => {
    const base =
      sourceFilter === "all"
        ? marketplaceListings
        : marketplaceListings.filter((l) => l.source === sourceFilter);

    return [...base].sort((a, b) => {
      switch (sortOrder) {
        case "price_asc":   return a.price - b.price;
        case "price_desc":  return b.price - a.price;
        case "recently_listed": return (b.listedAt ?? 0) - (a.listedAt ?? 0);
        case "common_to_rare": return a.price - b.price;
        case "rare_to_common": return b.price - a.price;
        default: return 0;
      }
    });
  })();

  const SORT_LABELS: Record<typeof sortOrder, string> = {
    price_asc: "Price: Low to High",
    price_desc: "Price: High to Low",
    recently_listed: "Recently Listed",
    common_to_rare: "Common to Rare",
    rare_to_common: "Rare to Common",
  };

  async function loadMarketplaceListings(
    targetCollectionAddress: string,
    reset = false
  ) {
    const requestId = ++marketplaceRequestRef.current;
    const cursor = reset ? null : marketplaceCursor;

    if (reset) {
      setMarketplaceError("");
      setLoadingMarketplace(true);
      setMarketplaceListings([]);
      setMarketplaceCursor(null);
      setHasMoreMarketplace(false);
    } else {
      setLoadingMoreMarketplace(true);
    }

    try {
      const query = new URLSearchParams({
        collection: targetCollectionAddress,
        limit: "12",
      });

      if (cursor) {
        query.set("cursor", cursor);
      }

      const response = await fetch(
        `/api/digital-art/marketplace-listings?${query.toString()}`
      );
      const payload = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(payload.error || "Failed to load marketplace listings");
      }

      if (marketplaceRequestRef.current !== requestId) {
        return;
      }

      const nextListings = Array.isArray(payload.listings) ? payload.listings : [];
      setMarketplaceListings((previous) =>
        dedupeListings(
          reset
            ? nextListings
            : [...previous, ...nextListings]
        )
      );
      setMarketplaceCursor(payload.nextCursor || null);
      setHasMoreMarketplace(Boolean(payload.hasMore));
    } catch (error: any) {
      if (marketplaceRequestRef.current !== requestId) {
        return;
      }
      setMarketplaceError(
        error?.message || "Failed to load marketplace listings"
      );
    } finally {
      if (marketplaceRequestRef.current === requestId) {
        setLoadingMarketplace(false);
        setLoadingMoreMarketplace(false);
      }
    }
  }

  useEffect(() => {
    const requestId = ++dataRequestRef.current;

    async function loadData() {
      setLoading(true);
      marketplaceRequestRef.current += 1;
      setMarketplaceError("");
      setMarketplaceListings([]);
      setMarketplaceCursor(null);
      setHasMoreMarketplace(false);
      setLoadingMarketplace(false);
      setLoadingMoreMarketplace(false);

      try {
        const allowlistResponse = await fetch("/api/admin/allowlist");
        const allowlistPayload = await allowlistResponse.json();
        const collections = Array.isArray(allowlistPayload.collections)
          ? allowlistPayload.collections
          : [];

        const selectedCollection =
          collections.find((item: any) => item.collectionAddress === collectionAddress) ||
          null;

        if (dataRequestRef.current !== requestId) {
          return;
        }

        setCollection(selectedCollection);

        if (!selectedCollection) {
          setListings([]);
          setUserNFTs([]);
          return;
        }

        const siblingAddresses: string[] = collections
          .filter((item: any) => item.name === selectedCollection.name)
          .map((item: any) => item.collectionAddress)
          .filter(Boolean);

        const targetAddresses = siblingAddresses.length
          ? siblingAddresses
          : [collectionAddress];

        const nativeListingsPromise = Promise.all(
          targetAddresses.map((address) =>
            fetch(`/api/on-chain-listings?collection=${address}`)
              .then((response) => response.json())
              .then((payload) => payload.listings || [])
              .catch(() => [])
          )
        );

        const userNftsPromise = walletAddress
          ? Promise.all(
              targetAddresses.map((address) =>
                fetch(`/api/nfts?owner=${walletAddress}&collection=${address}`)
                  .then((response) => response.json())
                  .then((payload) => payload.nfts || [])
                  .catch(() => [])
              )
            )
          : Promise.resolve([]);

        const [nativeListings, ownedNfts] = await Promise.all([
          nativeListingsPromise,
          userNftsPromise,
        ]);

        if (dataRequestRef.current !== requestId) {
          return;
        }

        setListings(nativeListings.flat());
        setUserNFTs(walletAddress ? (ownedNfts as UserNFT[][]).flat() : []);

        if (
          selectedCollection.marketplaces?.magicEden?.symbol ||
          selectedCollection.marketplaces?.tensor?.slug
        ) {
          void loadMarketplaceListings(collectionAddress, true);
        }
      } catch (error) {
        console.error("Failed to load collection:", error);
      } finally {
        if (dataRequestRef.current === requestId) {
          setLoading(false);
        }
      }
    }

    void loadData();
  }, [collectionAddress, walletAddress]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (sortDropdownRef.current && !sortDropdownRef.current.contains(e.target as Node)) {
        setSortOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  if (loading) {
    return (
      <main className="min-h-screen pt-32 pb-20">
        <div className="max-w-7xl mx-auto px-4 text-center">
          <div className="inline-block animate-spin mb-4">
            <div className="w-8 h-8 border-4 border-gray-700 border-t-gold-500 rounded-full" />
          </div>
          <p className="text-gray-400">Loading collection...</p>
        </div>
      </main>
    );
  }

  if (!collection) {
    return (
      <main className="min-h-screen pt-32 pb-20">
        <div className="max-w-2xl mx-auto px-4 text-center">
          <div className="text-5xl mb-4">🔍</div>
          <h2 className="font-serif text-2xl text-white mb-4">
            Collection Not Found
          </h2>
          <p className="text-gray-400 mb-6">
            This collection is not approved on Artifacte.
          </p>
          <Link
            href="/digital-art"
            className="text-gold-400 hover:text-gold-300 transition"
          >
            ← Back to Collections
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen pt-24 pb-20">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center gap-5 mb-10">
          <img
            src={collection.image}
            alt={collection.name}
            className="w-20 h-20 rounded-xl object-cover border border-white/10"
            onError={(event) => {
              (event.target as HTMLImageElement).src = PLACEHOLDER_IMAGE;
            }}
          />
          <div>
            <Link
              href="/digital-art"
              className="text-gold-500 hover:text-gold-400 text-sm mb-2 block"
            >
              ← Back to Digital Collectibles
            </Link>
            <h1 className="font-serif text-3xl text-white">{collection.name}</h1>
            <div className="flex items-center gap-4 mt-1">
              {collection.supply && (
                <span className="text-gray-500 text-sm">
                  {collection.supply.toLocaleString()} items
                </span>
              )}
              <span className="text-green-400 text-xs font-medium flex items-center gap-1">
                <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                  <path
                    fillRule="evenodd"
                    d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                    clipRule="evenodd"
                  />
                </svg>
                Verified Collection
              </span>
            </div>
            <p className="text-gray-600 text-xs font-mono mt-1">
              {collectionAddress}
            </p>
            {collection.links && (
              <div className="flex items-center gap-3 mt-2">
                {collection.links.website && (
                  <a
                    href={collection.links.website}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-gray-500 hover:text-gold-400 transition"
                  >
                    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z" />
                    </svg>
                  </a>
                )}
                {collection.links.twitter && (
                  <a
                    href={collection.links.twitter}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-gray-500 hover:text-gold-400 transition"
                  >
                    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                    </svg>
                  </a>
                )}
                {collection.links.discord && (
                  <a
                    href={collection.links.discord}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-gray-500 hover:text-gold-400 transition"
                  >
                    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03z" />
                    </svg>
                  </a>
                )}
              </div>
            )}
          </div>
        </div>

        {collection.description && (
          <div className="mb-10 max-w-3xl">
            <p className="text-gray-400 text-sm leading-relaxed">
              {collection.description}
            </p>
          </div>
        )}

        {userNFTs.length > 0 && (
          <div className="mb-16">
            <div className="flex items-center justify-between mb-6">
              <h2 className="font-serif text-2xl text-white">Your NFTs</h2>
              <button
                onClick={() => setShowUserNFTs(!showUserNFTs)}
                className="text-gold-400 hover:text-gold-300 text-sm transition"
              >
                {showUserNFTs ? "Hide" : "Show"}
              </button>
            </div>

            {showUserNFTs && (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                {userNFTs.map((nft) => (
                  <div
                    key={nft.mint}
                    className="bg-dark-800 border border-white/5 rounded-xl overflow-hidden group hover:border-gold-500/30 transition"
                  >
                    <div className="aspect-square overflow-hidden bg-dark-700">
                      <img
                        src={nft.image}
                        alt={nft.name}
                        loading="lazy"
                        className="w-full h-full object-cover group-hover:scale-105 transition duration-300"
                        onError={(event) => {
                          (event.target as HTMLImageElement).src = PLACEHOLDER_IMAGE;
                        }}
                      />
                    </div>
                    <div className="p-3">
                      <p className="text-white text-sm font-semibold truncate">
                        {nft.name}
                      </p>
                      <Link
                        href={`/list?mint=${nft.mint}`}
                        className="mt-2 block w-full text-center py-2 bg-gold-500 hover:bg-gold-600 text-dark-900 font-semibold text-xs rounded transition"
                      >
                        List Item
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        <div>
          <h2 className="font-serif text-2xl text-white mb-6">
            Artifacte Listings
          </h2>
          {listings.length === 0 ? (
            <div className="bg-dark-800 border border-white/10 rounded-xl p-12 text-center">
              <div className="text-5xl mb-4">📭</div>
              <h3 className="font-serif text-xl text-white mb-2">
                No Listings Yet
              </h3>
              <p className="text-gray-400 mb-6 text-sm">
                No NFTs from this collection are currently listed on Artifacte.
              </p>
              {userNFTs.length > 0 && (
                <Link
                  href={`/list?collection=${collectionAddress}`}
                  className="inline-block px-6 py-3 bg-gold-500 hover:bg-gold-600 text-dark-900 font-semibold rounded-lg transition text-sm"
                >
                  List Your {collection.name} NFT
                </Link>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
              {listings.map((nft: any) => {
                const isAuctionEnded =
                  nft.listingType === "auction" &&
                  nft.endTime > 0 &&
                  Date.now() / 1000 > nft.endTime;

                return (
                  <Link
                    key={nft.nftMint}
                    href={`/digital-art/auction/${nft.nftMint}?collection=${collectionAddress}`}
                    className={`bg-dark-800 border rounded-xl overflow-hidden group transition ${
                      isAuctionEnded
                        ? "border-yellow-700/40 opacity-75"
                        : "border-white/5 hover:border-gold-500/30"
                    }`}
                  >
                    <div className="aspect-square overflow-hidden bg-dark-700 relative">
                      <img
                        src={nft.nftImage}
                        alt={nft.nftName}
                        loading="lazy"
                        className="w-full h-full object-cover group-hover:scale-105 transition duration-300"
                        onError={(event) => {
                          (event.target as HTMLImageElement).src = PLACEHOLDER_IMAGE;
                        }}
                      />
                      {isAuctionEnded && (
                        <div className="absolute top-2 left-2 bg-yellow-900/90 text-yellow-200 text-[10px] font-semibold px-2 py-0.5 rounded">
                          Ended
                        </div>
                      )}
                    </div>
                    <div className="p-3">
                      <p className="text-white text-sm font-semibold truncate">
                        {nft.nftName}
                      </p>
                      <div className="flex items-center justify-between mt-2">
                        <div>
                          <p className="text-gray-500 text-[10px] uppercase">
                            {isAuctionEnded
                              ? "Ended"
                              : nft.listingType === "auction"
                                ? "Current Bid"
                                : "Price"}
                          </p>
                          <p
                            className={`font-semibold text-sm ${
                              isAuctionEnded ? "text-yellow-200/70" : "text-white"
                            }`}
                          >
                            ◎ {nft.currentBid > 0 ? nft.currentBid : nft.price}
                          </p>
                        </div>
                        <span
                          className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
                            isAuctionEnded
                              ? "bg-yellow-900/40 text-yellow-300 border border-yellow-700"
                              : nft.listingType === "auction"
                                ? "bg-purple-900/40 text-purple-300 border border-purple-700"
                                : "bg-green-900/40 text-green-300 border border-green-700"
                          }`}
                        >
                          {isAuctionEnded
                            ? "Ended"
                            : nft.listingType === "auction"
                              ? "Auction"
                              : "Buy Now"}
                        </span>
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </div>

        <div className="mt-16">
          <div className="flex items-center justify-between gap-4 mb-6">
            <div>
              <h2 className="font-serif text-2xl text-white">
                Marketplace Listings
              </h2>
              <p className="text-gray-400 text-sm mt-1">
                Curated external listings from Tensor and Magic Eden for this
                collection.
              </p>
            </div>
            {hasMarketplaceConfig && !loadingMarketplace && !marketplaceError && (
              <div className="flex items-center gap-3 flex-wrap">
                {(
                  [
                    { value: "all", label: "All" },
                    ...(hasMagicEden ? [{ value: "magiceden", label: "Magic Eden" }] : []),
                    ...(hasTensor ? [{ value: "tensor", label: "Tensor" }] : []),
                  ] as { value: "all" | "magiceden" | "tensor"; label: string }[]
                ).map(({ value, label }) => (
                  <button
                    key={value}
                    onClick={() => setSourceFilter(value)}
                    className={`px-4 py-1.5 rounded-full text-xs font-semibold border transition ${
                      sourceFilter === value
                        ? "bg-gold-500 border-gold-500 text-dark-900"
                        : "bg-transparent border-white/15 text-gray-400 hover:border-gold-500/50 hover:text-white"
                    }`}
                  >
                    {label}
                    {value !== "all" && (
                      <span className="ml-1.5 opacity-70">
                        {marketplaceListings.filter((l) => l.source === value).length}
                      </span>
                    )}
                  </button>
                ))}

                {/* Sort dropdown */}
                <div className="relative ml-auto" ref={sortDropdownRef}>
                  <button
                    onClick={() => setSortOpen((o) => !o)}
                    className="flex items-center gap-2 px-4 py-1.5 rounded-lg text-xs font-semibold border border-white/15 bg-dark-800 text-gray-300 hover:border-gold-500/50 hover:text-white transition"
                  >
                    {SORT_LABELS[sortOrder]}
                    <svg
                      className={`w-3 h-3 transition-transform ${sortOpen ? "rotate-180" : ""}`}
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={2}
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>
                  {sortOpen && (
                    <div className="absolute right-0 top-full mt-1 z-20 w-48 bg-dark-800 border border-white/10 rounded-xl shadow-xl overflow-hidden">
                      {(Object.keys(SORT_LABELS) as (typeof sortOrder)[]).map((key) => (
                        <button
                          key={key}
                          onClick={() => { setSortOrder(key); setSortOpen(false); }}
                          className={`w-full text-left px-4 py-2.5 text-xs transition ${
                            sortOrder === key
                              ? "text-gold-400 bg-gold-500/10"
                              : "text-gray-300 hover:bg-white/5 hover:text-white"
                          }`}
                        >
                          {SORT_LABELS[key]}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {!hasMarketplaceConfig ? (
            <div className="bg-dark-800 border border-white/10 rounded-xl p-12 text-center">
              <div className="text-5xl mb-4">🧭</div>
              <h3 className="font-serif text-xl text-white mb-2">
                Marketplace Support Coming Soon
              </h3>
              <p className="text-gray-400 text-sm">
                This curated collection is visible on Artifacte, but external
                marketplace IDs are not configured yet.
              </p>
            </div>
          ) : loadingMarketplace ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
              {Array.from({ length: 10 }).map((_, index) => (
                <div
                  key={index}
                  className="bg-dark-800 border border-white/5 rounded-xl h-72 animate-pulse"
                />
              ))}
            </div>
          ) : marketplaceError ? (
            <div className="bg-dark-800 border border-red-700/40 rounded-xl p-8 text-center">
              <h3 className="font-serif text-xl text-white mb-2">
                Marketplace Listings Unavailable
              </h3>
              <p className="text-red-300/80 text-sm mb-5">{marketplaceError}</p>
              <button
                onClick={() => loadMarketplaceListings(collectionAddress, true)}
                className="px-5 py-2.5 bg-gold-500 hover:bg-gold-600 text-dark-900 font-semibold rounded-lg transition text-sm"
              >
                Retry
              </button>
            </div>
          ) : filteredListings.length === 0 ? (
            <div className="bg-dark-800 border border-white/10 rounded-xl p-12 text-center">
              <div className="text-5xl mb-4">🪄</div>
              <h3 className="font-serif text-xl text-white mb-2">
                No External Listings Right Now
              </h3>
              <p className="text-gray-400 text-sm">
                {sourceFilter === "all"
                  ? "We could not find any active buy-now listings for this collection on the curated marketplace sources."
                  : `No listings found on ${sourceFilter === "magiceden" ? "Magic Eden" : "Tensor"} for this collection.`}
              </p>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                {filteredListings.map((listing) => {
                  const listedAt = formatListedAt(listing.listedAt);

                  return (
                    <Link
                      key={listing.id}
                      href={`/digital-art/auction/${listing.mint}?source=${listing.source}&collection=${collectionAddress}`}
                      className="bg-dark-800 border border-white/5 rounded-xl overflow-hidden group hover:border-gold-500/30 transition"
                    >
                      <div className="aspect-square overflow-hidden bg-dark-700 relative">
                        <img
                          src={listing.image}
                          alt={listing.name}
                          loading="lazy"
                          className="w-full h-full object-cover group-hover:scale-105 transition duration-300"
                          onError={(event) => {
                            (event.target as HTMLImageElement).src = PLACEHOLDER_IMAGE;
                          }}
                        />
                        <div className="absolute top-2 left-2 px-2 py-0.5 rounded-full bg-dark-900/90 text-[10px] font-semibold text-white border border-white/10">
                          {formatMarketplaceSource(listing.source)}
                        </div>
                        <div className="absolute top-2 right-2 px-2 py-0.5 rounded-full bg-green-900/70 text-[10px] font-semibold text-green-200 border border-green-700/70">
                          Buy Now
                        </div>
                      </div>
                      <div className="p-3">
                        <p className="text-white text-sm font-semibold truncate">
                          {listing.name}
                        </p>
                        <div className="flex items-center justify-between mt-2 gap-3">
                          <div>
                            <p className="text-gray-500 text-[10px] uppercase">
                              Price
                            </p>
                            <p className="text-white font-semibold text-sm">
                              {formatMarketplacePrice(
                                listing.price,
                                listing.currencySymbol
                              )}
                            </p>
                          </div>
                          <span className="text-[10px] px-2 py-0.5 rounded-full font-medium bg-white/5 text-gray-300 border border-white/10">
                            {listing.currencySymbol}
                          </span>
                        </div>
                        {listedAt && (
                          <p className="text-gray-500 text-xs mt-2">
                            Listed {listedAt}
                          </p>
                        )}
                      </div>
                    </Link>
                  );
                })}
              </div>

              {hasMoreMarketplace && (
                <div className="mt-8 text-center">
                  <button
                    onClick={() => loadMarketplaceListings(collectionAddress)}
                    disabled={loadingMoreMarketplace}
                    className={`px-6 py-3 rounded-lg font-semibold text-sm transition ${
                      loadingMoreMarketplace
                        ? "bg-gray-700 text-gray-400 cursor-not-allowed"
                        : "bg-gold-500 hover:bg-gold-600 text-dark-900"
                    }`}
                  >
                    {loadingMoreMarketplace ? "Loading..." : "Load More"}
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </main>
  );
}
