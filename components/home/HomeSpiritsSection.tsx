import Link from "next/link";

import VerifiedBadge from "@/components/VerifiedBadge";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { formatFullPrice } from "@/lib/data";
import type { HomeListing } from "@/lib/server/homepage";

import { HomeImage } from "./HomeImage";
import { HomeSectionHeading } from "./HomeSectionHeading";

type HomeSpiritsSectionProps = {
  listings: readonly HomeListing[];
};

export function HomeSpiritsSection({ listings }: HomeSpiritsSectionProps) {
  return (
    <section className="border-t border-white/5 bg-dark-800/30 px-4 py-20 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl">
        <HomeSectionHeading
          eyebrow="Premium Selection"
          title="Fine Spirits 🥃"
          action={
            <Link href="/auctions/categories/spirits" className="text-sm font-medium text-gold-500 transition hover:text-gold-400">
              View All →
            </Link>
          }
        />

        <div className="overflow-x-auto overscroll-x-contain pb-4">
          <div className="flex gap-6 snap-x">
            {listings.map((listing) => {
              const key = listing.id ?? listing.externalUrl ?? listing.nftAddress ?? listing.name ?? "spirits-card";
              const cardContent = (
                <Card className="h-full gap-0 overflow-hidden rounded-lg border border-white/5 bg-dark-800 py-0 text-white shadow-none">
                  <div className="relative aspect-square overflow-hidden bg-dark-900">
                    <HomeImage
                      src={listing.image}
                      alt={listing.name ?? "Spirit listing"}
                      sizes="320px"
                      contain
                      className="group-hover:scale-105"
                    />
                  </div>
                  <div className="flex flex-1 flex-col justify-between p-6">
                    <div>
                      <div className="mb-3 flex items-start justify-between gap-2">
                        <Badge className="rounded bg-transparent px-0 text-xs font-semibold tracking-widest uppercase text-gold-500 hover:bg-transparent">
                          Fixed Price
                        </Badge>
                        <VerifiedBadge collectionName={listing.name} verifiedBy={listing.verifiedBy} />
                      </div>
                      <h3 className="mb-1 text-base font-medium text-white">{listing.name}</h3>
                      <p className="mb-1 text-xs text-gray-500">{listing.subtitle}</p>
                      <p className="mb-4 text-xs text-gray-600">{listing.spiritType}</p>
                    </div>
                    <div>
                      <p className="mb-1 text-xs font-medium tracking-wider text-gray-500">Price</p>
                      <p className="font-serif text-2xl text-white">{formatFullPrice(listing.price ?? 0)}</p>
                    </div>
                  </div>
                </Card>
              );

              if (listing.externalUrl) {
                return (
                  <a
                    key={key}
                    href={listing.externalUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="group w-80 shrink-0 snap-start"
                  >
                    {cardContent}
                  </a>
                );
              }

              return (
                <Link key={key} href="/auctions/categories/spirits" className="group w-80 shrink-0 snap-start">
                  {cardContent}
                </Link>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}