import Link from "next/link";

import { HomeImage } from "@/components/home/HomeImage";
import { Card, CardContent } from "@/components/ui/card";

import type { DigitalArtCollectionCardData } from "../_lib/page-data";

interface DigitalArtCollectionsGridProps {
  collections: readonly DigitalArtCollectionCardData[];
}

function EmptyCollectionsState() {
  return (
    <Card className="border-white/10 bg-dark-800/85 py-0">
      <CardContent className="px-6 py-14 text-center">
        <h3 className="font-serif text-xl text-white">No collections approved yet</h3>
        <p className="mx-auto mt-3 max-w-md text-sm text-white/55">
          Curated digital art collections will appear here once they are approved on Artifacte.
        </p>
      </CardContent>
    </Card>
  );
}

function CollectionCard({ collection }: { collection: DigitalArtCollectionCardData }) {
  return (
    <Link href={collection.href} className="group block h-full">
      <Card className="h-full gap-0 overflow-hidden border-white/5 bg-dark-800/90 py-0 transition duration-200 hover:border-gold-500/30 hover:bg-dark-800">
        <div className="relative aspect-square overflow-hidden bg-dark-900">
          <HomeImage
            src={collection.imageSrc}
            alt={collection.name}
            sizes="(max-width: 768px) 50vw, (max-width: 1280px) 33vw, 25vw"
            className="group-hover:scale-105"
          />
          <div className="absolute inset-0 bg-linear-to-t from-dark-900/80 via-transparent to-transparent" />
        </div>
        <CardContent className="space-y-1 px-4 py-4">
          <h3 className="line-clamp-2 text-sm font-semibold text-white transition group-hover:text-gold-400">
            {collection.name}
          </h3>
          {collection.supply ? (
            <p className="text-xs text-white/45">{collection.supply.toLocaleString()} items</p>
          ) : null}
        </CardContent>
      </Card>
    </Link>
  );
}

export function DigitalArtCollectionsGrid({ collections }: DigitalArtCollectionsGridProps) {
  if (!collections.length) {
    return <EmptyCollectionsState />;
  }

  return (
    <div className="grid grid-cols-2 gap-6 sm:grid-cols-3 lg:grid-cols-4">
      {collections.map((collection) => (
        <CollectionCard key={collection.collectionAddress} collection={collection} />
      ))}
    </div>
  );
}