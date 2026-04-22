import Link from "next/link";

import { HomeImage } from "@/components/home/HomeImage";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

import type { DigitalArtListingCardData, DigitalArtListingsStatus } from "../_lib/page-data";

interface ActiveListingsGridProps {
  listings: readonly DigitalArtListingCardData[];
  status: DigitalArtListingsStatus;
}

export function ActiveListingsGridFallback() {
  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
      {Array.from({ length: 10 }).map((_, index) => (
        <Skeleton key={index} className="aspect-4/5 rounded-xl bg-white/8" />
      ))}
    </div>
  );
}

function formatSolAmount(lamports: number): string {
  return `◎ ${(lamports / 1_000_000_000).toFixed(2)}`;
}

function formatTimeRemaining(endTime: number | null): string | null {
  if (!endTime) {
    return null;
  }

  const now = Math.floor(Date.now() / 1000);
  const difference = endTime - now;
  if (difference <= 0) {
    return "Ended";
  }

  const days = Math.floor(difference / (24 * 60 * 60));
  const hours = Math.floor((difference % (24 * 60 * 60)) / (60 * 60));

  return days > 0 ? `${days}d ${hours}h` : `${hours}h`;
}

function EmptyListingsState() {
  return (
    <Card className="border-white/10 bg-dark-800/85 py-0">
      <CardContent className="px-6 py-14 text-center">
        <h3 className="font-serif text-xl text-white">No active listings</h3>
        <p className="mx-auto mt-3 max-w-md text-sm text-white/55">
          No NFTs are currently listed. Be the first to list a digital collectible from a curated collection.
        </p>
        <Link
          href="/list"
          className={cn(
            buttonVariants({ size: "lg" }),
            "mt-6 inline-flex bg-gold-500 text-dark-900 hover:bg-gold-500/90"
          )}
        >
          List Your NFT
        </Link>
      </CardContent>
    </Card>
  );
}

function ListingsUnavailableState() {
  return (
    <Card className="border-white/10 bg-dark-800/85 py-0">
      <CardContent className="px-6 py-14 text-center">
        <h3 className="font-serif text-xl text-white">Live listings are temporarily unavailable</h3>
        <p className="mx-auto mt-3 max-w-md text-sm text-white/55">
          Artifacte could not reach the on-chain listing feed for this request. Refresh the page to try again.
        </p>
      </CardContent>
    </Card>
  );
}

function ListingCard({ listing }: { listing: DigitalArtListingCardData }) {
  const timeRemaining = listing.listingType === "auction" ? formatTimeRemaining(listing.endTime) : null;
  const displayAmount =
    listing.listingType === "auction" && listing.currentBidLamports
      ? listing.currentBidLamports
      : listing.priceLamports;

  return (
    <Link href={listing.href} className="group block h-full">
      <Card className="h-full gap-0 overflow-hidden border-white/5 bg-dark-800/90 py-0 transition duration-200 hover:border-gold-500/30 hover:bg-dark-800">
        <div className="relative aspect-square overflow-hidden bg-dark-900">
          <HomeImage
            src={listing.imageSrc}
            alt={listing.name}
            sizes="(max-width: 768px) 50vw, (max-width: 1280px) 33vw, 20vw"
            className="group-hover:scale-105"
          />
        </div>
        <CardContent className="space-y-3 px-3 py-3">
          <div className="space-y-1">
            <p className="truncate text-sm font-semibold text-white">{listing.name}</p>
            <p className="truncate text-xs text-white/45">{listing.collectionName}</p>
          </div>

          {timeRemaining ? (
            <div className="rounded-lg border border-white/8 bg-dark-900 px-2 py-1.5">
              <p className="text-[9px] font-medium uppercase tracking-[0.16em] text-white/40">Ends in</p>
              <p className="mt-1 text-xs font-semibold text-gold-400">{timeRemaining}</p>
            </div>
          ) : null}

          <div className="flex items-end justify-between gap-3 pt-1">
            <div>
              <p className="text-[10px] uppercase tracking-[0.16em] text-white/40">
                {listing.listingType === "auction" && listing.currentBidLamports ? "Current Bid" : "Price"}
              </p>
              <p className="mt-1 text-sm font-semibold text-white">{formatSolAmount(displayAmount)}</p>
            </div>
            <Badge
              className={cn(
                "rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em]",
                listing.listingType === "auction"
                  ? "border-violet-500/30 bg-violet-500/15 text-violet-200"
                  : "border-emerald-500/30 bg-emerald-500/15 text-emerald-200"
              )}
            >
              {listing.listingType === "auction" ? "Auction" : "Buy"}
            </Badge>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}

export function ActiveListingsGrid({ listings, status }: ActiveListingsGridProps) {
  if (status === "unavailable") {
    return <ListingsUnavailableState />;
  }

  if (!listings.length) {
    return <EmptyListingsState />;
  }

  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
      {listings.map((listing) => (
        <ListingCard key={listing.mint} listing={listing} />
      ))}
    </div>
  );
}