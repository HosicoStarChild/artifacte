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
    twitter ? { href: twitter, label: "View collection on X", icon: "x" as const } : null,
    discord ? { href: discord, label: "Join collection Discord", icon: "discord" as const } : null,
    website ? { href: website, label: "Visit collection website", icon: "website" as const } : null,
  ].filter((item): item is { href: string; label: string; icon: "x" | "discord" | "website" } => item !== null);

  if (!items.length) {
    return null;
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      {items.map((item) => (
        <a
          key={item.label}
          href={item.href}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-white/10 bg-white/5 text-gold-400 transition hover:border-gold-500/40 hover:bg-gold-500/10 hover:text-gold-300"
          aria-label={item.label}
          title={item.label}
        >
          {item.icon === "x" ? (
            <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
            </svg>
          ) : item.icon === "discord" ? (
            <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M20.317 4.37a19.8 19.8 0 0 0-4.885-1.515.074.074 0 0 0-.079.037 13.9 13.9 0 0 0-.608 1.25 18.3 18.3 0 0 0-5.487 0 12.6 12.6 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.7 19.7 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.1 14.1 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.1 13.1 0 0 1-1.872-.892.077.077 0 0 1-.008-.128c.126-.094.25-.19.372-.292a.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.3 12.3 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.8 19.8 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03ZM8.02 15.33c-1.18 0-2.15-1.08-2.15-2.41 0-1.33.95-2.42 2.15-2.42 1.21 0 2.17 1.1 2.15 2.42 0 1.33-.95 2.41-2.15 2.41Zm7.97 0c-1.18 0-2.15-1.08-2.15-2.41 0-1.33.95-2.42 2.15-2.42 1.21 0 2.17 1.1 2.15 2.42 0 1.33-.94 2.41-2.15 2.41Z" />
            </svg>
          ) : (
            <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24" aria-hidden="true">
              <circle cx="12" cy="12" r="10" />
              <path d="M2 12h20" />
              <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10Z" />
            </svg>
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