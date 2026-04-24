import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { formatFullPrice } from "@/lib/data";
import { cn } from "@/lib/utils";
import { getHomeHeroCta, type HomeListing } from "@/lib/server/homepage";

import { HomeImage } from "./HomeImage";

type FeaturedListingSectionProps = {
  listing: HomeListing | null;
};

export function FeaturedListingSection({ listing }: FeaturedListingSectionProps) {
  if (!listing) {
    return null;
  }

  const cta = getHomeHeroCta(listing);
  const priceLabel =
    listing.currency === "SOL"
      ? `◎${listing.solPrice?.toFixed(4) ?? listing.price ?? 0}`
      : formatFullPrice(listing.price ?? 0);

  return (
    <Card className="mb-16 gap-0 overflow-hidden rounded-lg border border-white/5 bg-dark-800 py-0 text-white shadow-none">
      <div className="flex flex-col md:flex-row">
        <div className="group relative flex h-62.5 items-center justify-center overflow-hidden bg-dark-900 md:h-87.5 md:w-1/2">
          <HomeImage
            src={listing.image}
            alt={listing.name ?? "Featured listing"}
            sizes="(max-width: 768px) 100vw, 50vw"
            priority
            contain
            className="p-4 group-hover:scale-105"
          />
        </div>

        <div className="flex flex-col justify-center p-6 md:w-1/2 md:p-10">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <p className="text-xs font-semibold tracking-widest uppercase text-gold-500">Featured Listing</p>
            {listing.verifiedBy === "TCGplayer" ? (
              <Badge className="rounded bg-gold-500/20 px-2 py-0.5 text-xs font-medium text-gold-400 hover:bg-gold-500/20">
                TCGplayer Verified
              </Badge>
            ) : null}
            {listing.source === "collector-crypt" ? (
              <Badge className="rounded bg-violet-500/20 px-2 py-0.5 text-xs font-medium text-violet-400 hover:bg-violet-500/20">
                Collector Crypt
              </Badge>
            ) : null}
          </div>

          <h1 className="mb-3 font-serif text-2xl leading-tight text-white md:text-4xl">{listing.name}</h1>
          <p className="mb-2 text-sm text-gray-400">{listing.subtitle}</p>
          <p className="mb-6 font-serif text-2xl text-white md:text-3xl">{priceLabel}</p>

          {cta.external ? (
            <a
              href={cta.href}
              target="_blank"
              rel="noopener noreferrer"
              className={cn(
                buttonVariants({ size: "lg" }),
                "inline-flex w-fit bg-gold-500 px-8 text-sm font-semibold text-dark-900 hover:bg-gold-600"
              )}
            >
              {cta.label}
            </a>
          ) : (
            <Link
              href={cta.href}
              className={cn(
                buttonVariants({ size: "lg" }),
                "inline-flex w-fit bg-gold-500 px-8 text-sm font-semibold text-dark-900 hover:bg-gold-600"
              )}
            >
              {cta.label}
            </Link>
          )}
        </div>
      </div>
    </Card>
  );
}