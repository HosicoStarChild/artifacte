"use client";

import dynamic from "next/dynamic";
import Link from "next/link";

import AuctionCard from "@/components/AuctionCard";
import { MarketplaceListingCard } from "@/components/MarketplaceListingCard";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { getListingPurchaseCurrency, resolveListingDisplayPrice, type Auction } from "@/lib/data";
import { getExternalMarketplaceTotalPrice } from "@/lib/external-purchase-fees";

import {
  getListingHref,
  getListingImageFit,
  getListingSourceBadge,
  ITEMS_PER_PAGE,
  type CategoryMarketplaceListing,
  type CategoryRouteTab,
} from "../_lib/category-page";

const CategoryListingPurchaseAction = dynamic(
  () => import("@/components/category/CategoryListingPurchaseAction"),
  {
    ssr: false,
    loading: () => (
      <Button
        type="button"
        disabled
        className="h-10 w-full bg-white/10 text-white/45 hover:bg-white/10"
      >
        Loading...
      </Button>
    ),
  },
);

type CategoryListingsSectionProps = {
  categoryName: string;
  fixedListings: CategoryMarketplaceListing[];
  isDigitalArt: boolean;
  liveAuctions: Auction[];
  listingsFilterLoading: boolean;
  listingsLoading: boolean;
  page: number;
  tab: CategoryRouteTab;
  totalItems: number;
  totalPages: number;
  useMarketplaceListings: boolean;
  onListingPurchased: (listingId: string, nftAddress?: string) => void;
  onPageChange: (page: number) => void;
};

function EmptyState({ description }: { description: string }) {
  return (
    <Card className="border-white/5 bg-dark-800/70 py-0">
      <CardContent className="space-y-4 px-6 py-14 text-center">
        <h2 className="font-serif text-2xl text-white">Nothing to show right now</h2>
        <p className="mx-auto max-w-xl text-sm leading-6 text-white/55">{description}</p>
        <Link href="/" className="inline-flex items-center justify-center text-sm font-medium text-gold-300 hover:text-gold-200">
          Back to Home →
        </Link>
      </CardContent>
    </Card>
  );
}

function LoadingState() {
  return (
    <div className="grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: 6 }).map((_, index) => (
        <Card key={index} className="border-white/5 bg-dark-800/70 py-0">
          <Skeleton className="aspect-square rounded-none bg-white/8" />
          <CardContent className="space-y-4 px-5 py-5">
            <Skeleton className="h-4 w-20 bg-white/8" />
            <Skeleton className="h-5 w-4/5 bg-white/8" />
            <Skeleton className="h-4 w-3/5 bg-white/8" />
            <Skeleton className="h-10 rounded-lg bg-white/8" />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function Pagination({
  page,
  totalItems,
  totalPages,
  onPageChange,
}: {
  page: number;
  totalItems: number;
  totalPages: number;
  onPageChange: (page: number) => void;
}) {
  if (totalItems <= ITEMS_PER_PAGE) {
    return null;
  }

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <p className="text-sm text-white/50">{totalItems.toLocaleString()} items</p>
      <div className="flex items-center gap-2">
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={page === 1}
          onClick={() => onPageChange(Math.max(1, page - 1))}
          className="border-white/10 bg-dark-800/80 text-white hover:bg-white/5"
        >
          ← Prev
        </Button>
        <span className="px-2 text-sm text-white/50">Page {page} of {totalPages}</span>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={page >= totalPages}
          onClick={() => onPageChange(Math.min(totalPages, page + 1))}
          className="border-white/10 bg-dark-800/80 text-white hover:bg-white/5"
        >
          Next →
        </Button>
      </div>
    </div>
  );
}

export function CategoryListingsSection({
  categoryName,
  fixedListings,
  isDigitalArt,
  liveAuctions,
  listingsFilterLoading,
  listingsLoading,
  page,
  tab,
  totalItems,
  totalPages,
  useMarketplaceListings,
  onListingPurchased,
  onPageChange,
}: CategoryListingsSectionProps) {
  function handlePageChange(nextPage: number) {
    onPageChange(nextPage);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  if (tab === "live") {
    if (liveAuctions.length === 0) {
      return (
        <EmptyState description="No live auctions are available in this category yet. Check back soon or browse the fixed-price inventory instead." />
      );
    }

    return (
      <div className="grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {liveAuctions.map((auction) => (
          <AuctionCard key={auction.id} auction={auction} />
        ))}
      </div>
    );
  }

  if (useMarketplaceListings && listingsLoading) {
    return <LoadingState />;
  }

  if (fixedListings.length === 0) {
    return (
      <EmptyState description="No fixed-price listings matched this category and filter combination. Adjust the filters or try another collection." />
    );
  }

  return (
    <div className="space-y-8">
      <Pagination
        page={page}
        totalItems={totalItems}
        totalPages={totalPages}
        onPageChange={handlePageChange}
      />

      <div className={`grid grid-cols-1 gap-8 transition-opacity duration-200 sm:grid-cols-2 lg:grid-cols-3 ${listingsFilterLoading ? "opacity-40" : "opacity-100"}`}>
        {fixedListings.map((listing, index) => {
          const purchaseCurrency = getListingPurchaseCurrency(listing);
          const displayPrice = resolveListingDisplayPrice(listing);
          const totalDisplayPrice = getExternalMarketplaceTotalPrice(displayPrice.amount, {
            source: listing.source,
          });
          const formattedAmount = displayPrice.currency === "SOL"
            ? totalDisplayPrice.toLocaleString(undefined, { maximumFractionDigits: 4 })
            : totalDisplayPrice.toLocaleString();

          return (
            <MarketplaceListingCard
              key={listing.id}
              href={getListingHref(listing)}
              external={Boolean(listing.externalUrl)}
              imageSrc={listing.image}
              imageAlt={listing.name}
              title={listing.name}
              subtitle={listing.subtitle}
              meta={categoryName}
              verifiedBy={listing.source === "phygitals" ? "TCGplayer" : listing.verifiedBy}
              priceLabel={
                isDigitalArt
                  ? `◎ ${listing.price.toLocaleString()}`
                  : purchaseCurrency === "SOL"
                    ? `◎ ${formattedAmount}`
                    : `$${formattedAmount}`
              }
              currencyLabel={isDigitalArt ? "SOL" : displayPrice.currency}
              sourceBadge={getListingSourceBadge(listing)}
              imageFit={getListingImageFit(listing)}
              imageLoading={index < 3 ? "eager" : "lazy"}
              imageSizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
              action={
                <CategoryListingPurchaseAction
                  listing={listing}
                  useMeApi={useMarketplaceListings}
                  isDigitalArt={isDigitalArt}
                  onPurchased={onListingPurchased}
                />
              }
            />
          );
        })}
      </div>

      <Pagination
        page={page}
        totalItems={totalItems}
        totalPages={totalPages}
        onPageChange={handlePageChange}
      />
    </div>
  );
}