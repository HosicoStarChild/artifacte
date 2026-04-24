"use client";

import Link from "next/link";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { HomeImage } from "@/components/home/HomeImage";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useWalletCapabilities } from "@/hooks/useWalletCapabilities";
import type { DigitalArtOwnedNft } from "@/app/digital-art/_lib/server-data";
import { cn } from "@/lib/utils";

interface OwnedNftsResponse {
  error?: string;
  nfts: DigitalArtOwnedNft[];
  total: number;
}

interface CollectionOwnedNftsSectionProps {
  targetAddresses: readonly string[];
}

async function fetchOwnedNfts(
  walletAddress: string,
  targetAddresses: readonly string[]
): Promise<DigitalArtOwnedNft[]> {
  const searchParams = new URLSearchParams({ owner: walletAddress });
  targetAddresses.forEach((targetAddress) => {
    searchParams.append("collection", targetAddress);
  });

  const response = await fetch(`/api/nfts?${searchParams.toString()}`);
  const payload = (await response.json()) as OwnedNftsResponse;

  if (!response.ok) {
    throw new Error(payload.error ?? "Failed to load owned NFTs");
  }

  return payload.nfts;
}

export function CollectionOwnedNftsSection({
  targetAddresses,
}: CollectionOwnedNftsSectionProps) {
  const { publicKey } = useWalletCapabilities();
  const walletAddress = publicKey?.toBase58() ?? null;
  const [isExpanded, setIsExpanded] = useState(false);

  const ownedNftsQuery = useQuery<DigitalArtOwnedNft[], Error>({
    enabled: Boolean(walletAddress),
    queryFn: () => fetchOwnedNfts(walletAddress ?? "", targetAddresses),
    queryKey: ["digital-art-owned-nfts", walletAddress, ...targetAddresses],
    staleTime: 60_000,
  });

  if (!walletAddress) {
    return null;
  }

  const nfts = ownedNftsQuery.data ?? [];
  if (!ownedNftsQuery.isPending && !ownedNftsQuery.isError && nfts.length === 0) {
    return null;
  }

  return (
    <section className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="font-serif text-2xl text-white">Your NFTs</h2>
          <p className="text-sm text-white/55">
            Items from this collection currently held by your connected wallet.
          </p>
        </div>

        <Button
          onClick={() => setIsExpanded((currentValue) => !currentValue)}
          size="sm"
          variant="outline"
          className="border-white/10 bg-dark-800 text-white hover:bg-dark-700"
        >
          {isExpanded ? "Hide" : "Show"}
        </Button>
      </div>

      {ownedNftsQuery.isError ? (
        <Card className="border-red-500/20 bg-dark-800/85 py-0">
          <CardContent className="px-6 py-6 text-sm text-red-200/85">
            {ownedNftsQuery.error.message}
          </CardContent>
        </Card>
      ) : null}

      {isExpanded ? (
        ownedNftsQuery.isPending ? (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {Array.from({ length: 5 }).map((_, index) => (
              <Skeleton key={index} className="aspect-4/5 rounded-xl bg-white/8" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {nfts.map((nft) => (
              <Card
                key={nft.mint}
                className="gap-0 overflow-hidden border-white/5 bg-dark-800/90 py-0"
              >
                <div className="relative aspect-square overflow-hidden bg-dark-900">
                  <HomeImage
                    src={nft.imageSrc}
                    alt={nft.name}
                    sizes="(max-width: 768px) 50vw, (max-width: 1280px) 33vw, 20vw"
                  />
                </div>

                <CardContent className="space-y-3 px-3 py-3">
                  <div className="space-y-1">
                    <p className="truncate text-sm font-semibold text-white">{nft.name}</p>
                    <p className="truncate text-xs text-white/45">{nft.collection}</p>
                  </div>

                  <Link
                    href={`/list?mint=${nft.mint}`}
                    className={cn(
                      buttonVariants({ size: "sm" }),
                      "w-full bg-gold-500 text-dark-900 hover:bg-gold-500/90"
                    )}
                  >
                    List Item
                  </Link>
                </CardContent>
              </Card>
            ))}
          </div>
        )
      ) : null}
    </section>
  );
}