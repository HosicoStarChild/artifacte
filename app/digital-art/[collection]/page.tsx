import { connection } from "next/server";
import Link from "next/link";

import { getDigitalArtCollectionPageData } from "@/app/digital-art/_lib/server-data";
import { HomeImage } from "@/components/home/HomeImage";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";

import { CollectionMarketplaceSection } from "./_components/marketplace-section";
import { CollectionNativeListingsSection } from "./_components/native-listings-section";
import { CollectionOwnedNftsSection } from "./_components/owned-nfts-section";

interface CollectionPageProps {
  params: Promise<{
    collection: string;
  }>;
}

function CollectionNotFoundState() {
  return (
    <main className="min-h-screen bg-dark-900 pt-24 pb-20">
      <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
        <Link
          href="/digital-art"
          className={cn(
            buttonVariants({ size: "sm", variant: "ghost" }),
            "mb-6 inline-flex px-0 text-gold-400 hover:bg-transparent hover:text-gold-300"
          )}
        >
          ← Back to Digital Collectibles
        </Link>

        <Card className="border-white/10 bg-dark-800/85 py-0">
          <div className="px-6 py-14 text-center">
            <h1 className="font-serif text-3xl text-white">Collection not found</h1>
            <p className="mx-auto mt-3 max-w-lg text-sm text-white/55">
              This collection is not approved on Artifacte or the address does not match a curated collection entry.
            </p>
          </div>
        </Card>
      </div>
    </main>
  );
}

function CollectionLinks({
  discord,
  twitter,
  website,
}: {
  discord?: string;
  twitter?: string;
  website?: string;
}) {
  const items = [
    website ? { href: website, label: "Website", icon: null } : null,
    twitter ? { href: twitter, label: "X", icon: "x" as const } : null,
    discord ? { href: discord, label: "Discord", icon: null } : null,
  ].filter((item): item is { href: string; label: string; icon: "x" | null } => item !== null);

  if (!items.length) {
    return null;
  }

  return (
    <div className="flex flex-wrap gap-3">
      {items.map((item) => (
        <a
          key={item.label}
          href={item.href}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center text-sm text-gold-400 transition hover:text-gold-300"
          aria-label={item.icon === "x" ? "View collection on X" : undefined}
        >
          {item.icon === "x" ? (
            <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
            </svg>
          ) : (
            item.label
          )}
        </a>
      ))}
    </div>
  );
}

export default async function CollectionPage({ params }: CollectionPageProps) {
  await connection();

  const { collection } = await params;
  const pageData = await getDigitalArtCollectionPageData(collection);

  if (!pageData.collection) {
    return <CollectionNotFoundState />;
  }

  const { collection: collectionData } = pageData;

  return (
    <main className="min-h-screen bg-dark-900 pt-24 pb-20">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <Link
          href="/digital-art"
          className={cn(
            buttonVariants({ size: "sm", variant: "ghost" }),
            "mb-6 inline-flex px-0 text-gold-400 hover:bg-transparent hover:text-gold-300"
          )}
        >
          ← Back to Digital Collectibles
        </Link>

        <section className="space-y-8">
          <div className="flex flex-col gap-6 md:flex-row md:items-start">
            <div className="relative h-24 w-24 overflow-hidden rounded-2xl border border-white/10 bg-dark-900">
              <HomeImage
                src={collectionData.imageSrc}
                alt={collectionData.name}
                sizes="96px"
              />
            </div>

            <div className="flex-1 space-y-3">
              <div className="flex flex-wrap items-center gap-3">
                <Badge className="border-emerald-500/30 bg-emerald-500/15 text-emerald-200">
                  Verified Collection
                </Badge>
                {collectionData.supply ? (
                  <Badge className="border-white/10 bg-white/5 text-white/75">
                    {collectionData.supply.toLocaleString()} items
                  </Badge>
                ) : null}
              </div>

              <div className="space-y-2">
                <h1 className="font-serif text-3xl text-white sm:text-4xl">
                  {collectionData.name}
                </h1>
                <p className="text-xs font-mono text-white/35">{collectionData.collectionAddress}</p>
              </div>

              {collectionData.description ? (
                <p className="max-w-3xl text-sm leading-6 text-white/60 sm:text-base">
                  {collectionData.description}
                </p>
              ) : null}

              <CollectionLinks
                discord={collectionData.links?.discord}
                twitter={collectionData.links?.twitter}
                website={collectionData.links?.website}
              />
            </div>
          </div>

          <CollectionOwnedNftsSection targetAddresses={collectionData.targetAddresses} />

          <CollectionNativeListingsSection
            collectionAddress={collectionData.collectionAddress}
            listings={pageData.nativeListings}
          />
        </section>

        <Separator className="my-10 bg-white/10" />

        <CollectionMarketplaceSection
          collection={collectionData}
          initialHasMore={pageData.marketplaceHasMore}
          initialListings={pageData.marketplaceListings}
          initialNextCursor={pageData.marketplaceNextCursor}
          initialSourceCounts={pageData.marketplaceSourceCounts}
          initialState={pageData.marketplaceState}
        />
      </div>
    </main>
  );
}