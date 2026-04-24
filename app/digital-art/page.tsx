import { connection } from "next/server";
import Link from "next/link";
import { Suspense } from "react";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";

import { ActiveListingsGrid, ActiveListingsGridFallback } from "./_components/active-listings-grid";
import { DigitalArtCollectionsGrid } from "./_components/collections-grid";
import {
  getDigitalArtActiveListings,
  getDigitalArtCollections,
  type DigitalArtListingCardData,
} from "./_lib/page-data";

async function ActiveListingsSection() {
  await connection();

  let activeListings: DigitalArtListingCardData[] = [];
  let status: "ready" | "unavailable" = "ready";

  try {
    activeListings = await getDigitalArtActiveListings();
  } catch (error) {
    console.error("[digital-art/page] Failed to load active listings", error);
    status = "unavailable";
  }

  return <ActiveListingsGrid listings={activeListings} status={status} />;
}

export default async function DigitalArtPage() {
  const collections = await getDigitalArtCollections();

  return (
    <main className="min-h-screen bg-dark-900 pt-24 pb-20">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <Link
          href="/"
          className={cn(
            buttonVariants({ size: "sm", variant: "ghost" }),
            "mb-6 inline-flex px-0 text-gold-400 hover:bg-transparent hover:text-gold-300"
          )}
        >
          ← Back to Home
        </Link>
        <section className="space-y-10">
          <div className="space-y-3">
            <Badge className="border-gold-500/30 bg-gold-500/10 text-[10px] font-semibold tracking-[0.24em] uppercase text-gold-300">
              Curated Collections
            </Badge>
            <div className="space-y-2">
              <h1 className="font-serif text-4xl text-white sm:text-5xl">Digital Collectibles</h1>
              <p className="max-w-2xl text-sm leading-6 text-white/60 sm:text-base">
                Browse verified Solana NFT collections on Artifacte. Each collection is curated and approved for discovery, listing, and live bidding.
              </p>
            </div>
          </div>

          <DigitalArtCollectionsGrid collections={collections} />
        </section>

        <Separator className="my-10 bg-white/10" />

        <section className="space-y-8">
          <div className="space-y-3">
            <Badge className="border-gold-500/20 bg-gold-500/8 text-[10px] font-semibold tracking-[0.24em] uppercase text-gold-300">
              On-Chain Listings
            </Badge>
            <div className="space-y-2">
              <h2 className="font-serif text-3xl text-white">Active Auctions & Sales</h2>
              <p className="max-w-2xl text-sm leading-6 text-white/60 sm:text-base">
                Live listings from the Artifacte community. Bid on auctions or purchase fixed-price items instantly.
              </p>
            </div>
          </div>

          <Suspense fallback={<ActiveListingsGridFallback />}>
            <ActiveListingsSection />
          </Suspense>
        </section>
      </div>
    </main>
  );
}
