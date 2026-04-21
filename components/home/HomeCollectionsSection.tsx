import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import type { HomeCategoryLink } from "@/lib/server/homepage";

import { HomeImage } from "./HomeImage";
import { HomeSectionHeading } from "./HomeSectionHeading";

type HomeCollectionsSectionProps = {
  categoryCards: readonly HomeCategoryLink[];
};

export function HomeCollectionsSection({ categoryCards }: HomeCollectionsSectionProps) {
  return (
    <div className="mb-24">
      <HomeSectionHeading eyebrow="Browse" title="Collections" />

      <div className="flex flex-col gap-6">
        <Link href="/auctions/categories/artifacte" className="group block">
          <Card className="relative h-48 gap-0 overflow-hidden rounded-lg border-2 border-gold-500/70 py-0 shadow-none sm:h-56">
            <HomeImage
              src="/artifacte-collection-banner.jpg"
              alt="The Artifacte Collection"
              sizes="(max-width: 768px) 100vw, 1200px"
              className="group-hover:scale-105"
            />
            <div className="absolute inset-0 bg-linear-to-t from-black/80 via-black/30 to-black/10" />
            <div className="relative flex h-full flex-col justify-end p-4 sm:p-6">
              <span className="mb-1 block text-xs font-bold tracking-widest uppercase text-gold-400">Exclusive</span>
              <div className="flex items-end justify-between gap-3">
                <div>
                  <h3 className="font-serif text-xl text-white sm:text-2xl md:text-3xl">The Artifacte Collection</h3>
                  <p className="mt-1 text-sm text-gray-300">Explore collection →</p>
                </div>
                <Badge className="hidden rounded-full bg-black/40 px-3 py-1.5 text-xs font-semibold whitespace-nowrap text-gold-500 backdrop-blur-xs hover:bg-black/40 sm:inline-flex">
                  Artifacte Originals
                </Badge>
              </div>
            </div>
          </Card>
        </Link>

        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
          {categoryCards.map((categoryCard) => (
            <Link key={categoryCard.slug} href={categoryCard.href} className="group block">
              <Card className="relative h-48 gap-0 overflow-hidden rounded-lg border-2 border-gold-500/70 py-0 shadow-none">
                <HomeImage
                  src={categoryCard.image}
                  alt={categoryCard.name}
                  sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
                  contain={categoryCard.contain}
                  className={categoryCard.contain ? "p-4 group-hover:scale-110" : "group-hover:scale-110"}
                />
                <div className="absolute inset-0 bg-linear-to-t from-black/80 via-black/40 to-black/10" />
                <div className="relative flex h-full flex-col justify-end p-6">
                  <h3 className="mb-1 font-serif text-xl text-white">{categoryCard.name}</h3>
                  <div className="flex items-center justify-between gap-4">
                    <p className="text-sm text-gray-300">Explore collection →</p>
                    {categoryCard.count ? (
                      <span className="text-xs font-semibold text-gold-500">{categoryCard.count} items</span>
                    ) : null}
                  </div>
                </div>
              </Card>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}