import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import type { MyListingRecord } from "@/lib/my-listings";
import { cn } from "@/lib/utils";

interface MyListingCardProps {
  isPending: boolean;
  listing: MyListingRecord;
  onAction: (listing: MyListingRecord) => void;
}

const statusBadgeClasses: Record<MyListingRecord["status"], string> = {
  active: "border-emerald-500/25 bg-emerald-500/15 text-emerald-200",
  cancelled: "border-red-500/25 bg-red-500/12 text-red-200",
  completed: "border-blue-500/25 bg-blue-500/15 text-blue-200",
};

function formatCurrencyValue(listing: MyListingRecord): string {
  const maximumFractionDigits = listing.currency === "SOL" ? 4 : 2;
  const value = listing.price.toLocaleString(undefined, {
    maximumFractionDigits,
    minimumFractionDigits: listing.currency === "SOL" ? 0 : 2,
  });

  if (listing.currency === "USDC") {
    return `$${value}`;
  }

  if (listing.currency === "SOL") {
    return `◎ ${value}`;
  }

  return `${value} ${listing.currency}`;
}

function getStatusLabel(status: MyListingRecord["status"]): string {
  if (status === "completed") {
    return "Sold";
  }

  if (status === "cancelled") {
    return "Cancelled";
  }

  return "Active";
}

function getTimeRemainingLabel(endsAt?: number): string | null {
  if (!endsAt) {
    return null;
  }

  const difference = endsAt - Date.now();
  if (difference <= 0) {
    return "Ended";
  }

  if (difference < 60 * 60 * 1000) {
    return `${Math.floor(difference / (60 * 1000))}m left`;
  }

  if (difference < 24 * 60 * 60 * 1000) {
    return `${Math.floor(difference / (60 * 60 * 1000))}h left`;
  }

  return `${Math.floor(difference / (24 * 60 * 60 * 1000))}d left`;
}

function getActionLabel(listing: MyListingRecord, isPending: boolean): string {
  if (isPending) {
    return listing.source === "tensor" ? "Delisting..." : "Cancelling...";
  }

  if (listing.source === "tensor") {
    return "Delist";
  }

  return listing.isCore ? "Cancel Listing" : "Cancel Listing & Return NFT";
}

export function MyListingCard({
  isPending,
  listing,
  onAction,
}: MyListingCardProps) {
  const timeRemaining = getTimeRemainingLabel(listing.endsAt);
  const isActionable = listing.status === "active";

  return (
    <Card className="h-full overflow-hidden border-white/5 bg-dark-800/85 py-0 text-white transition duration-200 hover:border-white/15 hover:bg-dark-800">
      <Link className="group block" href={listing.href}>
        <div className="relative aspect-square overflow-hidden bg-dark-900">
          <img
            alt={listing.name}
            className="object-cover transition duration-300 group-hover:scale-[1.02]"
            sizes="(min-width: 1280px) 23vw, (min-width: 768px) 30vw, (min-width: 640px) 45vw, 100vw"
            src={listing.image}
          />

          <div className="absolute left-3 top-3 flex flex-wrap gap-2">
            <Badge className="border-white/10 bg-dark-900/80 text-[10px] font-semibold tracking-[0.18em] uppercase text-gold-300 backdrop-blur-md">
              {listing.listingTypeLabel}
            </Badge>
            <Badge className="border-white/10 bg-dark-900/80 text-[10px] font-semibold tracking-[0.18em] uppercase text-white/75 backdrop-blur-md">
              {listing.source === "tensor" ? "Tensor" : listing.isCore ? "Artifacte Core" : "Artifacte"}
            </Badge>
          </div>

          <div className="absolute right-3 top-3">
            <Badge className={cn("border text-[10px] font-semibold tracking-[0.18em] uppercase backdrop-blur-md", statusBadgeClasses[listing.status])}>
              {getStatusLabel(listing.status)}
            </Badge>
          </div>

          {timeRemaining ? (
            <div className="absolute bottom-3 left-3 rounded-xl border border-white/10 bg-dark-900/80 px-3 py-1.5 text-xs font-semibold text-gold-300 backdrop-blur-md">
              {timeRemaining}
            </div>
          ) : null}
        </div>

        <CardContent className="space-y-4 px-4 py-4">
          <div className="space-y-1">
            <h3 className="truncate text-sm font-medium text-white">{listing.name}</h3>
            <p className="truncate font-mono text-[11px] text-white/45">{listing.nftMint}</p>
            {listing.collectionAddress ? (
              <p className="truncate text-[11px] text-white/45">{listing.collectionAddress}</p>
            ) : null}
          </div>

          <Separator className="bg-white/8" />

          <div className="space-y-2">
            <div className="flex items-start justify-between gap-4 text-sm">
              <span className="text-white/50">
                {listing.mode === "auction" ? "Starting Price" : "Price"}
              </span>
              <span className="text-right font-semibold text-white">
                {formatCurrencyValue(listing)}
              </span>
            </div>

            {listing.currentBid !== undefined ? (
              <div className="flex items-start justify-between gap-4 text-sm">
                <span className="text-white/50">Current Bid</span>
                <span className="text-right font-semibold text-gold-300">
                  {listing.currentBid.toLocaleString(undefined, {
                    maximumFractionDigits: listing.currency === "SOL" ? 4 : 2,
                    minimumFractionDigits: listing.currency === "SOL" ? 0 : 2,
                  })} {listing.currency}
                </span>
              </div>
            ) : null}
          </div>
        </CardContent>
      </Link>

      {isActionable ? (
        <CardFooter className="border-t border-white/6 bg-dark-900/55 px-4 py-4">
          <Button
            className="w-full"
            disabled={isPending}
            onClick={() => onAction(listing)}
            size="lg"
            variant="destructive"
          >
            {getActionLabel(listing, isPending)}
          </Button>
        </CardFooter>
      ) : null}
    </Card>
  );
}