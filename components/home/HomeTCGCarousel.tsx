"use client";

import dynamic from "next/dynamic";
import Link from "next/link";

import VerifiedBadge from "@/components/VerifiedBadge";
import { Badge } from "@/components/ui/badge";
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

import { HomeImage } from "./HomeImage";
import { HomeSectionHeading } from "./HomeSectionHeading";

const WalletMultiButton = dynamic(
  () => import("@solana/wallet-adapter-react-ui").then((module) => module.WalletMultiButton),
  { ssr: false }
);

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
                    <Card className="group h-full gap-0 overflow-hidden rounded-lg border border-white/5 bg-dark-800 py-0 text-white shadow-none">
                      <Link href={cardHref} className="flex flex-1 flex-col">
                        <div className="relative aspect-square overflow-hidden bg-dark-900">
                          <HomeImage
                            src={listing.image}
                            alt={listing.name}
                            sizes="288px"
                            contain
                            className="p-2 group-hover:scale-105"
                          />
                        </div>

                        <div className="flex flex-1 flex-col justify-between p-5">
                          <div>
                            <div className="mb-2 flex items-start justify-between gap-2">
                              <Badge className="rounded bg-transparent px-0 text-xs font-semibold tracking-widest uppercase text-gold-500 hover:bg-transparent">
                                Fixed Price
                              </Badge>
                              <VerifiedBadge collectionName={listing.name} verifiedBy={listing.verifiedBy} />
                            </div>
                            <h3 className="mb-1 line-clamp-2 text-sm font-medium text-white">{listing.name}</h3>
                            <p className="mb-3 text-xs text-gray-500">{listing.subtitle}</p>
                          </div>

                          <div>
                            <p className="mb-1 text-xs font-medium tracking-wider text-gray-500">Price</p>
                            <p className="font-serif text-xl text-white">
                              {displayPrice.currency === "SOL" ? `◎ ${primaryAmount}` : `$${primaryAmount}`}
                            </p>
                            <p className="mt-1 text-xs text-gold-500">{displayPrice.currency}</p>
                          </div>
                        </div>
                      </Link>

                      {showBuyButton ? (
                        <div className="px-5 pb-5">
                          {isPurchased ? (
                            <button
                              type="button"
                              disabled
                              className="h-10 w-full cursor-not-allowed rounded-lg bg-gray-600/50 px-4 py-2.5 text-sm font-semibold text-gray-400"
                            >
                              Purchased
                            </button>
                          ) : canBuyHere ? (
                            connected ? (
                              <button
                                type="button"
                                onClick={() => onBuyNow?.(listing)}
                                disabled={buyingId === listing.id}
                                className="h-10 w-full rounded-lg bg-gold-500 px-4 py-2.5 text-sm font-semibold text-dark-900 transition-colors duration-200 hover:bg-gold-600 disabled:opacity-50"
                              >
                                {buyingId === listing.id ? "Processing..." : "Buy Now"}
                              </button>
                            ) : (
                              <WalletMultiButton className="h-10! w-full justify-center! rounded-lg! bg-gold-500! text-sm! font-semibold! text-dark-900! hover:bg-gold-600!" />
                            )
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
                          )}
                        </div>
                      ) : null}
                    </Card>
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