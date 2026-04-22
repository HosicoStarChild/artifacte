import { connection } from "next/server";
import Link from "next/link";

import {
  getDigitalArtExternalListingDetail,
  getDigitalArtNativeListingDetail,
} from "@/app/digital-art/_lib/server-data";
import type { MarketplaceSource } from "@/app/lib/digital-art-marketplaces";
import { HomeImage } from "@/components/home/HomeImage";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

import { AuctionDetailActionPanel } from "./_components/action-panel";

interface AuctionDetailPageProps {
  params: Promise<{
    mint: string;
  }>;
  searchParams: Promise<{
    collection?: string | string[];
    source?: string | string[];
  }>;
}

function isMarketplaceSource(value: string | undefined): value is MarketplaceSource {
  return value === "magiceden" || value === "tensor";
}

function formatMarketplaceSource(source: MarketplaceSource): string {
  return source === "magiceden" ? "Magic Eden" : "Tensor";
}

function ListingNotFoundState({ backHref }: { backHref: string }) {
  return (
    <main className="min-h-screen bg-dark-900 pt-24 pb-20">
      <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
        <Link
          href={backHref}
          className={cn(
            buttonVariants({ size: "sm", variant: "ghost" }),
            "mb-6 inline-flex px-0 text-gold-400 hover:bg-transparent hover:text-gold-300"
          )}
        >
          ← Back to Digital Collectibles
        </Link>

        <Card className="border-white/10 bg-dark-800/90 py-0">
          <div className="px-6 py-14 text-center">
            <h1 className="font-serif text-3xl text-white">Listing not found</h1>
            <p className="mx-auto mt-3 max-w-lg text-sm text-white/55">
              This listing does not exist anymore or is no longer available for the selected collection.
            </p>
          </div>
        </Card>
      </div>
    </main>
  );
}

export default async function AuctionDetailPage({
  params,
  searchParams,
}: AuctionDetailPageProps) {
  await connection();

  const { mint } = await params;
  const resolvedSearchParams = await searchParams;
  const sourceValue = Array.isArray(resolvedSearchParams.source)
    ? resolvedSearchParams.source[0]
    : resolvedSearchParams.source;
  const collectionValue = Array.isArray(resolvedSearchParams.collection)
    ? resolvedSearchParams.collection[0]
    : resolvedSearchParams.collection;
  const source = isMarketplaceSource(sourceValue) ? sourceValue : null;
  const collectionAddress = collectionValue ?? null;
  const backHref = collectionAddress ? `/digital-art/${collectionAddress}` : "/digital-art";

  let externalListing = null;
  let nativeListing = null;

  try {
    if (source && collectionAddress) {
      externalListing = await getDigitalArtExternalListingDetail({
        collectionAddress,
        mint,
        source,
      });
    } else if (!source) {
      nativeListing = await getDigitalArtNativeListingDetail(mint);
    }
  } catch (error) {
    console.error("[digital-art/auction] Failed to load listing detail", error);
  }

  if ((source && !externalListing) || (!source && !nativeListing)) {
    return <ListingNotFoundState backHref={backHref} />;
  }

  const imageSrc = externalListing?.image ?? nativeListing?.imageSrc ?? "/placeholder.png";
  const collectionName = externalListing?.collectionName ?? nativeListing?.collectionName ?? "Unknown Collection";
  const title = externalListing?.name ?? nativeListing?.name ?? "Untitled";

  return (
    <main className="min-h-screen bg-dark-900 pt-24 pb-20">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        <Link
          href={backHref}
          className={cn(
            buttonVariants({ size: "sm", variant: "ghost" }),
            "mb-6 inline-flex px-0 text-gold-400 hover:bg-transparent hover:text-gold-300"
          )}
        >
          ← Back to Digital Collectibles
        </Link>

        <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
          <div className="lg:col-span-1">
            <Card className="sticky top-24 overflow-hidden border-white/10 bg-dark-800/90 py-0">
              <div className="relative aspect-square bg-dark-900">
                <HomeImage
                  src={imageSrc}
                  alt={title}
                  sizes="(max-width: 1024px) 100vw, 33vw"
                />
              </div>
            </Card>
          </div>

          <div className="space-y-8 lg:col-span-2">
            <section className="space-y-4">
              <div className="flex flex-wrap gap-2">
                {externalListing ? (
                  <>
                    <Badge className="border-white/10 bg-white/5 text-white">
                      {formatMarketplaceSource(externalListing.source)}
                    </Badge>
                    <Badge className="border-emerald-500/20 bg-emerald-500/15 text-emerald-200">
                      Buy Now
                    </Badge>
                    <Badge className="border-white/10 bg-white/5 text-white/75">
                      {externalListing.currencySymbol}
                    </Badge>
                  </>
                ) : nativeListing ? (
                  <>
                    <Badge
                      className={
                        nativeListing.listingType === "auction"
                          ? "border-sky-500/20 bg-sky-500/15 text-sky-200"
                          : "border-emerald-500/20 bg-emerald-500/15 text-emerald-200"
                      }
                    >
                      {nativeListing.listingType === "auction" ? "Auction" : "Buy Now"}
                    </Badge>
                    <Badge className="border-white/10 bg-white/5 text-white/75">SOL</Badge>
                    {nativeListing.status !== "active" ? (
                      <Badge className="border-white/10 bg-white/5 text-white/75">
                        {nativeListing.status}
                      </Badge>
                    ) : null}
                  </>
                ) : null}
              </div>

              <div className="space-y-2">
                <p className="text-sm text-white/45">{collectionName}</p>
                <h1 className="font-serif text-4xl text-white">{title}</h1>
                <p className="text-xs font-mono text-white/35">{mint}</p>
              </div>
            </section>

            <AuctionDetailActionPanel
              key={source ? `${source}:${mint}:${collectionAddress ?? ""}` : `native:${mint}`}
              collectionAddress={collectionAddress}
              externalListing={externalListing}
              mint={mint}
              nativeListing={nativeListing}
            />
          </div>
        </div>
      </div>
    </main>
  );
}