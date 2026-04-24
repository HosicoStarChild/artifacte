import Link from "next/link";

import { HomeImage } from "@/components/home/HomeImage";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import type { DigitalArtNativeListingSummary } from "@/app/digital-art/_lib/server-data";

interface CollectionNativeListingsSectionProps {
  collectionAddress: string;
  listings: readonly DigitalArtNativeListingSummary[];
}

function formatSolAmount(lamports: number): string {
  return `◎ ${(lamports / 1_000_000_000).toFixed(2)}`;
}

function getAuctionEnded(endTime: number | null): boolean {
  return Boolean(endTime && endTime <= Math.floor(Date.now() / 1000));
}

export function CollectionNativeListingsSection({
  collectionAddress,
  listings,
}: CollectionNativeListingsSectionProps) {
  if (!listings.length) {
    return null;
  }

  return (
    <section className="space-y-6">
      <div className="space-y-2">
        <h2 className="font-serif text-2xl text-white">Artifacte Listings</h2>
        <p className="max-w-2xl text-sm text-white/55">
          Native on-chain listings currently available for this curated collection.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
        {listings.map((listing) => {
          const isAuctionEnded = listing.listingType === "auction" && getAuctionEnded(listing.endTime);
          const displayLamports = listing.currentBidLamports ?? listing.priceLamports;

          return (
            <Link
              key={listing.nftMint}
              href={`/digital-art/auction/${listing.nftMint}?collection=${collectionAddress}`}
              className="group block h-full"
            >
              <Card className="h-full gap-0 overflow-hidden border-white/5 bg-dark-800/90 py-0 transition duration-200 hover:border-gold-500/30 hover:bg-dark-800">
                <div className="relative aspect-square overflow-hidden bg-dark-900">
                  <HomeImage
                    src={listing.imageSrc}
                    alt={listing.name}
                    sizes="(max-width: 768px) 50vw, (max-width: 1280px) 33vw, 20vw"
                    className="group-hover:scale-105"
                  />
                  {isAuctionEnded ? (
                    <Badge className="absolute left-2 top-2 border-yellow-500/20 bg-yellow-500/15 text-yellow-200">
                      Ended
                    </Badge>
                  ) : null}
                </div>

                <CardContent className="space-y-3 px-3 py-3">
                  <div className="space-y-1">
                    <p className="truncate text-sm font-semibold text-white">{listing.name}</p>
                    <p className="truncate text-xs text-white/45">{listing.collectionName}</p>
                  </div>

                  <div className="flex items-end justify-between gap-3">
                    <div>
                      <p className="text-[10px] uppercase tracking-[0.16em] text-white/40">
                        {isAuctionEnded
                          ? "Ended"
                          : listing.listingType === "auction" && listing.currentBidLamports
                            ? "Current Bid"
                            : "Price"}
                      </p>
                      <p className="mt-1 text-sm font-semibold text-white">
                        {formatSolAmount(displayLamports)}
                      </p>
                    </div>

                    <Badge
                      className={
                        isAuctionEnded
                          ? "border-yellow-500/20 bg-yellow-500/15 text-yellow-200"
                          : listing.listingType === "auction"
                            ? "border-violet-500/20 bg-violet-500/15 text-violet-200"
                            : "border-emerald-500/20 bg-emerald-500/15 text-emerald-200"
                      }
                    >
                      {isAuctionEnded
                        ? "Ended"
                        : listing.listingType === "auction"
                          ? "Auction"
                          : "Buy Now"}
                    </Badge>
                  </div>
                </CardContent>
              </Card>
            </Link>
          );
        })}
      </div>
    </section>
  );
}