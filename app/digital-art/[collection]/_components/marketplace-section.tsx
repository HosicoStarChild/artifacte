"use client";

import Link from "next/link";
import { useEffect, useEffectEvent, useMemo, useRef, useState } from "react";

import { HomeImage } from "@/components/home/HomeImage";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { EXTERNAL_MARKETPLACE_FEE_BPS } from "@/lib/external-purchase-fees";
import {
  resolveExternalMarketplacePayablePrice,
  type ExternalMarketplacePayablePrice,
} from "@/lib/listing-price";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import type { DigitalArtCollectionDetails } from "@/app/digital-art/_lib/server-data";
import type {
  ExternalMarketplaceListing,
  MarketplaceListingsState,
  MarketplaceSource,
  MarketplaceSourceCounts,
} from "@/app/lib/digital-art-marketplaces";

type MarketplaceSortOrder =
  | "price_asc"
  | "price_desc"
  | "recently_listed"
  | "common_to_rare"
  | "rare_to_common";

interface MarketplaceListingsResponse {
  error?: string;
  hasMore: boolean;
  listings: ExternalMarketplaceListing[];
  nextCursor: string | null;
  ok: boolean;
  sourceCounts?: MarketplaceSourceCounts;
  state?: MarketplaceListingsState;
}

interface CollectionMarketplaceSectionProps {
  collection: DigitalArtCollectionDetails;
  initialHasMore: boolean;
  initialListings: ExternalMarketplaceListing[];
  initialNextCursor: string | null;
  initialSourceCounts: MarketplaceSourceCounts | null;
  initialState: MarketplaceListingsState | null;
}

const SORT_LABELS: Record<MarketplaceSortOrder, string> = {
  common_to_rare: "Common to Rare",
  price_asc: "Price: Low to High",
  price_desc: "Price: High to Low",
  rare_to_common: "Rare to Common",
  recently_listed: "Recently Listed",
};

function dedupeListings(
  listings: readonly ExternalMarketplaceListing[]
): ExternalMarketplaceListing[] {
  const seenIds = new Set<string>();

  return listings.filter((listing) => {
    if (seenIds.has(listing.id)) {
      return false;
    }

    seenIds.add(listing.id);
    return true;
  });
}

function formatMarketplaceSource(source: MarketplaceSource): string {
  return source === "magiceden" ? "Magic Eden" : "Tensor";
}

function formatMarketplacePrice(
  price: number,
  currencySymbol: string
): string {
  if (currencySymbol === "SOL") {
    return `◎ ${price.toLocaleString(undefined, {
      maximumFractionDigits: 4,
      minimumFractionDigits: price < 1 ? 2 : 0,
    })}`;
  }

  return `${price.toLocaleString(undefined, {
    maximumFractionDigits: 2,
    minimumFractionDigits: 0,
  })} ${currencySymbol}`;
}

function formatBasisPointsPercent(basisPoints: number): string {
  return `${(basisPoints / 100).toLocaleString(undefined, {
    maximumFractionDigits: basisPoints % 100 === 0 ? 0 : 2,
  })}%`;
}

function buildFeeSummary(
  payablePrice: ExternalMarketplacePayablePrice
): string | null {
  const parts: string[] = [];

  if (payablePrice.royaltyBasisPoints > 0) {
    parts.push(`${formatBasisPointsPercent(payablePrice.royaltyBasisPoints)} royalty`);
  }

  if (payablePrice.feeApplied) {
    parts.push(`${formatBasisPointsPercent(EXTERNAL_MARKETPLACE_FEE_BPS)} Artifacte fee`);
  }

  return parts.length ? `Includes ${parts.join(" + ")}` : null;
}

type MarketplaceListingViewModel = {
  listing: ExternalMarketplaceListing;
  payablePrice: ExternalMarketplacePayablePrice;
};

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

function resolveDefaultSource(
  availableSources: readonly MarketplaceSource[],
  listings: readonly ExternalMarketplaceListing[],
  sourceCounts: MarketplaceSourceCounts | null
): MarketplaceSource {
  const populatedSource = availableSources.find((source) =>
    listings.some((listing) => listing.source === source)
  );

  if (populatedSource) {
    return populatedSource;
  }

  const countedSource = availableSources.find(
    (source) => (sourceCounts?.[source] ?? 0) > 0
  );

  return countedSource ?? availableSources[0] ?? "tensor";
}

function isMarketplaceSortOrder(value: string): value is MarketplaceSortOrder {
  return value in SORT_LABELS;
}

function MarketplaceEmptyState({ message, title }: { message: string; title: string }) {
  return (
    <Card className="border-white/10 bg-dark-800/85 py-0">
      <CardContent className="px-6 py-14 text-center">
        <h3 className="font-serif text-xl text-white">{title}</h3>
        <p className="mx-auto mt-3 max-w-md text-sm text-white/55">{message}</p>
      </CardContent>
    </Card>
  );
}

function MarketplaceLoadingGrid() {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
      {Array.from({ length: 16 }).map((_, index) => (
        <Skeleton key={index} className="aspect-4/5 rounded-xl bg-white/8" />
      ))}
    </div>
  );
}

function createInitialHasMoreBySource(
  availableSources: readonly MarketplaceSource[],
  initialHasMore: boolean
): Record<MarketplaceSource, boolean> {
  return {
    magiceden: availableSources.includes("magiceden") ? initialHasMore : false,
    tensor: availableSources.includes("tensor") ? initialHasMore : false,
  };
}

export function CollectionMarketplaceSection({
  collection,
  initialHasMore,
  initialListings,
  initialNextCursor,
  initialSourceCounts,
  initialState,
}: CollectionMarketplaceSectionProps) {
  const availableSources: MarketplaceSource[] = [
    ...(collection.hasTensor ? (["tensor"] as const) : []),
    ...(collection.hasMagicEden ? (["magiceden"] as const) : []),
  ];
  const defaultSource = resolveDefaultSource(
    availableSources,
    initialListings,
    initialSourceCounts
  );
  const sentinelRef = useRef<HTMLDivElement>(null);

  const [marketplaceListings, setMarketplaceListings] = useState(initialListings);
  const [marketplaceNextCursor, setMarketplaceNextCursor] = useState(initialNextCursor);
  const [hasMoreBySource, setHasMoreBySource] = useState<Record<MarketplaceSource, boolean>>(
    () => createInitialHasMoreBySource(availableSources, initialHasMore)
  );
  const [marketplaceState, setMarketplaceState] = useState(initialState);
  const [marketplaceError, setMarketplaceError] = useState("");
  const [loadingMarketplace, setLoadingMarketplace] = useState(false);
  const [loadingMoreMarketplace, setLoadingMoreMarketplace] = useState(false);
  const [sourceFilter, setSourceFilter] = useState<MarketplaceSource>(defaultSource);
  const [sortOrder, setSortOrder] = useState<MarketplaceSortOrder>("price_asc");

  const filteredListings = useMemo(() => {
    const baseListings = marketplaceListings
      .filter((listing) => listing.source === sourceFilter)
      .filter((listing) => listing.price > 0)
      .map((listing) => ({
        listing,
        payablePrice: resolveExternalMarketplacePayablePrice(listing, {
          collectionAddress: collection.collectionAddress,
          collectionName: collection.name,
        }),
      }));

    return [...baseListings].sort((left, right) => {
      switch (sortOrder) {
        case "price_asc":
          return left.payablePrice.amount - right.payablePrice.amount;
        case "price_desc":
          return right.payablePrice.amount - left.payablePrice.amount;
        case "recently_listed":
          return (right.listing.listedAt ?? 0) - (left.listing.listedAt ?? 0);
        case "common_to_rare":
          return left.payablePrice.amount - right.payablePrice.amount;
        case "rare_to_common":
          return right.payablePrice.amount - left.payablePrice.amount;
      }
    });
  }, [
    collection.collectionAddress,
    collection.name,
    marketplaceListings,
    sortOrder,
    sourceFilter,
  ]);

  const hasMoreMarketplace = hasMoreBySource[sourceFilter];

  async function loadMarketplaceListings(reset: boolean): Promise<void> {
    if (reset) {
      setMarketplaceError("");
      setLoadingMarketplace(true);
    } else {
      setLoadingMoreMarketplace(true);
    }

    try {
      const searchParams = new URLSearchParams({
        collection: collection.collectionAddress,
        limit: "32",
        source: sourceFilter,
      });

      const cursor = reset ? null : marketplaceNextCursor;
      if (cursor) {
        searchParams.set("cursor", cursor);
      }

      const response = await fetch(
        `/api/digital-art/marketplace-listings?${searchParams.toString()}`
      );
      const payload = (await response.json()) as MarketplaceListingsResponse;

      if (!response.ok || !payload.ok) {
        throw new Error(payload.error ?? "Failed to load marketplace listings");
      }

      const nextListings = Array.isArray(payload.listings) ? payload.listings : [];

      setMarketplaceListings((previous) =>
        dedupeListings(reset ? nextListings : [...previous, ...nextListings])
      );
      setMarketplaceError("");
      setMarketplaceNextCursor(payload.nextCursor ?? null);
      setHasMoreBySource((previous) => ({
        ...previous,
        [sourceFilter]: payload.hasMore,
      }));
      setMarketplaceState(payload.state ?? null);
    } catch (error) {
      setMarketplaceError(
        error instanceof Error
          ? error.message
          : "Failed to load marketplace listings"
      );
    } finally {
      setLoadingMarketplace(false);
      setLoadingMoreMarketplace(false);
    }
  }

  const loadMoreMarketplaceListings = useEffectEvent(async () => {
    await loadMarketplaceListings(false);
  });

  useEffect(() => {
    if (
      filteredListings.length > 0 ||
      !hasMoreMarketplace ||
      loadingMarketplace ||
      loadingMoreMarketplace ||
      marketplaceError
    ) {
      return;
    }

    void loadMoreMarketplaceListings();
  }, [
    filteredListings.length,
    hasMoreMarketplace,
    loadingMarketplace,
    loadingMoreMarketplace,
    marketplaceError,
    loadMoreMarketplaceListings,
  ]);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel || !hasMoreMarketplace || loadingMoreMarketplace) {
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          void loadMoreMarketplaceListings();
        }
      },
      { rootMargin: "200px" }
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasMoreMarketplace, loadingMoreMarketplace]);

  if (!collection.hasMarketplaceConfig) {
    return (
      <section className="space-y-6">
        <div className="space-y-2">
          <h2 className="font-serif text-2xl text-white">Marketplace Listings</h2>
          <p className="max-w-2xl text-sm text-white/55">
            Curated external listings from Tensor and Magic Eden for this collection.
          </p>
        </div>
        <MarketplaceEmptyState
          title="Marketplace support coming soon"
          message="This curated collection is visible on Artifacte, but external marketplace identifiers are not configured yet."
        />
      </section>
    );
  }

  return (
    <section className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="space-y-2">
          <h2 className="font-serif text-2xl text-white">Marketplace Listings</h2>
          <p className="max-w-2xl text-sm text-white/55">
            Curated external listings from Tensor and Magic Eden for this collection.
          </p>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
          <div className="flex flex-wrap gap-2">
            {availableSources.map((source) => (
              <Button
                key={source}
                onClick={() => setSourceFilter(source)}
                size="sm"
                variant={sourceFilter === source ? "secondary" : "outline"}
                className={
                  sourceFilter === source
                    ? "bg-gold-500 text-dark-900 hover:bg-gold-500/90"
                    : "border-white/15 bg-transparent text-white/70 hover:bg-white/5 hover:text-white"
                }
              >
                {formatMarketplaceSource(source)}
              </Button>
            ))}
          </div>

          <div className="space-y-1">
            <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-white/45">
              Sort by
            </p>
            <Select
              onValueChange={(value) => {
                if (value && isMarketplaceSortOrder(value)) {
                  setSortOrder(value);
                }
              }}
              value={sortOrder}
            >
              <SelectTrigger className="border-white/15 bg-dark-800 text-white" size="sm">
                <SelectValue>{SORT_LABELS[sortOrder]}</SelectValue>
              </SelectTrigger>
              <SelectContent className="border border-white/10 bg-dark-800 text-white">
                {Object.entries(SORT_LABELS).map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      {loadingMarketplace && marketplaceListings.length === 0 ? <MarketplaceLoadingGrid /> : null}

      {marketplaceState?.warning ? (
        <Card className="border-amber-500/20 bg-dark-800/85 py-0">
          <CardContent className="space-y-2 px-6 py-4">
            <h3 className="font-serif text-lg text-white">
              {marketplaceState.stale
                ? "Showing recent verified listings"
                : "Marketplace data is partially unavailable"}
            </h3>
            <p className="text-sm text-amber-100/80">{marketplaceState.warning}</p>
          </CardContent>
        </Card>
      ) : null}

      {marketplaceError && marketplaceListings.length > 0 ? (
        <Card className="border-red-500/20 bg-dark-800/85 py-0">
          <CardContent className="space-y-2 px-6 py-4">
            <h3 className="font-serif text-lg text-white">Couldn’t refresh marketplace listings</h3>
            <p className="text-sm text-red-200/80">
              {marketplaceError}. Existing verified results are still shown below.
            </p>
          </CardContent>
        </Card>
      ) : null}

      {marketplaceError && marketplaceListings.length === 0 ? (
        <Card className="border-red-500/20 bg-dark-800/85 py-0">
          <CardContent className="space-y-4 px-6 py-8 text-center">
            <div className="space-y-2">
              <h3 className="font-serif text-xl text-white">Marketplace listings unavailable</h3>
              <p className="text-sm text-red-200/80">{marketplaceError}</p>
            </div>
            <Button
              onClick={() => {
                void loadMarketplaceListings(true);
              }}
              className="bg-gold-500 text-dark-900 hover:bg-gold-500/90"
            >
              Retry
            </Button>
          </CardContent>
        </Card>
      ) : null}

      {!loadingMarketplace &&
      !marketplaceError &&
      marketplaceListings.length === 0 &&
      marketplaceState?.degraded ? (
        <MarketplaceEmptyState
          title="Marketplace listings temporarily unavailable"
          message={
            marketplaceState.warning ??
            "Live external marketplace feeds are temporarily unavailable for this collection."
          }
        />
      ) : null}

      {!loadingMarketplace &&
      !marketplaceError &&
      filteredListings.length === 0 &&
      !(marketplaceListings.length === 0 && marketplaceState?.degraded) ? (
        <MarketplaceEmptyState
          title="No external listings right now"
          message={`No listings found on ${formatMarketplaceSource(sourceFilter)} for this collection.`}
        />
      ) : null}

      {filteredListings.length > 0 ? (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
            {filteredListings.map(({ listing, payablePrice }) => {
              const listedAt = formatListedAt(listing.listedAt);
              const feeSummary = buildFeeSummary(payablePrice);
              const payableCurrency = String(payablePrice.currency || listing.currencySymbol);
              const showsBreakdown = Math.abs(payablePrice.amount - payablePrice.baseAmount) > 1e-9;

              return (
                <Link
                  key={listing.id}
                  href={`/digital-art/auction/${listing.mint}?source=${listing.source}&collection=${collection.collectionAddress}`}
                  className="group block h-full"
                >
                  <Card className="h-full gap-0 overflow-hidden border-white/5 bg-dark-800/90 py-0 transition duration-200 hover:border-gold-500/30 hover:bg-dark-800">
                    <div className="relative aspect-square overflow-hidden bg-dark-900">
                      <HomeImage
                        src={listing.image}
                        alt={listing.name}
                        sizes="(max-width: 768px) 50vw, (max-width: 1280px) 20vw, 12vw"
                        className="group-hover:scale-105"
                      />
                      <Badge className="absolute left-2 top-2 border-white/10 bg-dark-900/90 text-white">
                        {formatMarketplaceSource(listing.source)}
                      </Badge>
                      <Badge className="absolute right-2 top-2 border-emerald-500/20 bg-emerald-500/15 text-emerald-200">
                        Buy Now
                      </Badge>
                    </div>

                    <CardContent className="space-y-2 px-3 py-3">
                      <p className="truncate text-sm font-semibold text-white">{listing.name}</p>
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="text-[10px] uppercase tracking-[0.16em] text-white/40">Total</p>
                          <p className="mt-1 text-sm font-semibold text-white">
                            {formatMarketplacePrice(payablePrice.amount, payableCurrency)}
                          </p>
                          
                        </div>
                        <Badge className="border-white/10 bg-white/5 text-white/75">
                          {payableCurrency}
                        </Badge>
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              );
            })}
          </div>

          <div ref={sentinelRef} className="flex justify-center pt-2">
            {loadingMoreMarketplace ? (
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-white/15 border-t-gold-500" />
            ) : null}
          </div>
        </>
      ) : null}
    </section>
  );
}