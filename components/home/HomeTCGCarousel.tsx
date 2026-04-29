"use client";

import Link from "next/link";

import { MarketplaceListingCard } from "@/components/MarketplaceListingCard";
import { buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { resolveListingDisplayPrice } from "@/lib/data";
import { getExternalMarketplaceTotalPrice } from "@/lib/external-purchase-fees";
import {
  getHomeTCGCardHref,
  isInAppExternalCardListing,
  type HomeTCGListing,
} from "@/lib/home-tcg";
import { cn } from "@/lib/utils";

import { HomeSectionHeading } from "./HomeSectionHeading";

type HomeTCGCarouselProps = {
  title: string;
  emoji: string;
  items: readonly HomeTCGListing[];
  bg?: string;
  viewAllHref?: string;
  viewAllLabel?: string;
  showBuyButton?: boolean;
  connected?: boolean;
  buyingId?: string | null;
  purchasedIds?: Record<string, boolean>;
  onBuyNow?: (listing: HomeTCGListing) => void;
};

function HomeTCGCarouselSkeleton() {
  return (
    <div className="overflow-x-auto overscroll-x-contain pb-4">
      <div className="flex gap-6">
        {Array.from({ length: 6 }).map((_, index) => (
          <Card
            key={`home-tcg-skeleton-${index}`}
            className="w-72 shrink-0 gap-0 overflow-hidden rounded-lg border border-white/5 bg-dark-800 py-0 shadow-none"
          >
            <Skeleton className="aspect-square rounded-none bg-dark-700" />
            <div className="space-y-3 p-5">
              <Skeleton className="h-3 w-20 bg-dark-700" />
              <Skeleton className="h-4 w-48 bg-dark-700" />
              <Skeleton className="h-3 w-32 bg-dark-700" />
              <Skeleton className="mt-4 h-6 w-24 bg-dark-700" />
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}

export function HomeTCGCarousel({
  title,
  emoji,
  items,
  bg,
  viewAllHref,
  viewAllLabel,
  showBuyButton,
  connected,
  buyingId,
  purchasedIds,
  onBuyNow,
}: HomeTCGCarouselProps) {
  return (
    <section className={cn(bg, "px-4 py-20 sm:px-6 lg:px-8")}>
      <div className="mx-auto min-w-0 max-w-7xl">
        <HomeSectionHeading
          eyebrow="Top Listings"
          title={`${title} ${emoji}`}
          className="mb-12 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between"
          action={
            <Link
              href={viewAllHref ?? "/auctions/categories/tcg-cards"}
              className="self-start text-sm font-medium text-gold-500 transition hover:text-gold-400 sm:self-auto"
            >
              {viewAllLabel ?? "View All TCG"} →
            </Link>
          }
        />

        {items.length === 0 ? (
          <HomeTCGCarouselSkeleton />
        ) : (
          <div className="overflow-x-auto overscroll-x-contain pb-4">
            <div className="flex gap-6 snap-x">
              {items.map((listing) => {
                const displayPrice = resolveListingDisplayPrice(listing);
                const totalDisplayPrice = getExternalMarketplaceTotalPrice(displayPrice.amount, {
                  collectionAddress: listing.collectionAddress,
                  collectionName: listing.collection,
                  source: listing.source,
                });
                const primaryAmount =
                  displayPrice.currency === "SOL"
                    ? totalDisplayPrice.toLocaleString(undefined, { maximumFractionDigits: 4 })
                    : totalDisplayPrice.toLocaleString();
                const cardHref = getHomeTCGCardHref(listing);
                const canBuyHere =
                  Boolean(showBuyButton) && isInAppExternalCardListing(listing) && Boolean(listing.nftAddress);
                const isPurchased = Boolean(purchasedIds?.[listing.id]);

                return (
                  <div key={listing.id} className="w-72 shrink-0 snap-start">
                    <MarketplaceListingCard
                      href={cardHref}
                      imageSrc={listing.image}
                      imageAlt={listing.name}
                      title={listing.name}
                      subtitle={listing.subtitle}
                      verifiedBy={listing.verifiedBy}
                      priceLabel={displayPrice.currency === "SOL" ? `◎ ${primaryAmount}` : `$${primaryAmount}`}
                      currencyLabel={displayPrice.currency}
                      imageFit="contain"
                      imageSizes="288px"
                      action={
                        showBuyButton ? (
                          isPurchased ? (
                            <button
                              type="button"
                              disabled
                              className="h-10 w-full cursor-not-allowed rounded-lg bg-gray-600/50 px-4 py-2.5 text-sm font-semibold text-gray-400"
                            >
                              Purchased
                            </button>
                          ) : canBuyHere ? (
                            <button
                              type="button"
                              onClick={connected ? () => onBuyNow?.(listing) : undefined}
                              disabled={!connected || buyingId === listing.id}
                              className="h-10 w-full rounded-lg bg-gold-500 px-4 py-2.5 text-sm font-semibold text-dark-900 transition-colors duration-200 hover:bg-gold-600 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              {buyingId === listing.id ? "Processing..." : "Buy Now"}
                            </button>
                          ) : (
                            <Link
                              href={cardHref}
                              className={cn(
                                buttonVariants({ size: "lg" }),
                                "h-10 w-full bg-gold-500 text-center text-sm font-semibold text-dark-900 hover:bg-gold-600"
                              )}
                            >
                              View Details
                            </Link>
                          )
                        ) : null
                      }
                    />
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}