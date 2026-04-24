"use client";

import Link from "next/link";

import { HomeImage } from "@/components/home/HomeImage";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Auction, formatPrice } from "@/lib/data";

import Countdown from "./Countdown";
import VerifiedBadge from "./VerifiedBadge";

export default function AuctionCard({ auction }: { auction: Auction }) {
  return (
    <Link href={`/auctions/${auction.slug}`} className="group block h-full min-w-75 shrink-0">
      <Card className="h-full gap-0 overflow-hidden rounded-xl border border-white/5 bg-dark-800 py-0 text-white shadow-none transition duration-200 hover:border-gold-500/30 hover:bg-dark-800/95">
        <div className="relative aspect-square overflow-hidden bg-dark-900">
          <HomeImage
            src={auction.image}
            alt={auction.name}
            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
            className="group-hover:scale-105"
          />

          <div className="absolute left-4 top-4 flex items-center gap-2">
            <Badge className="border-red-500/20 bg-red-600/95 px-2.5 text-white">
              <span className="h-1.5 w-1.5 rounded-full bg-white pulse-gold" />
              LIVE
            </Badge>
            <Badge className="border-white/10 bg-dark-900/85 px-2.5 font-mono text-gold-400">
              <Countdown endTime={auction.end_time} />
            </Badge>
          </div>
        </div>

        <CardContent className="flex flex-1 flex-col justify-between p-5">
          <div>
            <div className="mb-3 flex items-center justify-between gap-2">
              <Badge className="rounded bg-transparent px-0 text-xs font-semibold tracking-widest uppercase text-gold-500 hover:bg-transparent">
                Live Auction
              </Badge>
              <VerifiedBadge collectionName={auction.name} verifiedBy={auction.verifiedBy} />
            </div>
            <h3 className="mb-1 text-base font-medium text-white">{auction.name}</h3>
            <p className="mb-1 text-xs text-gray-500">
              {auction.subtitle}
              {auction.verifiedBy ? ` • ${auction.verifiedBy} Verified` : ""}
            </p>
            <p className="mb-4 text-xs text-gray-600">{auction.category?.replace(/_/g, " ")}</p>
          </div>
          <div className="space-y-4">
            <div>
              <p className="mb-1 text-xs font-medium tracking-wider text-gray-500">Current Bid</p>
              <p className="font-serif text-2xl text-white">
                {auction.category === "DIGITAL_ART" ? `◎ ${auction.current_bid.toLocaleString()}` : formatPrice(auction.current_bid)}
              </p>
              <p className="mt-1 text-xs text-gold-500">
                {auction.current_bid.toLocaleString()} {auction.category === "DIGITAL_ART" ? "SOL" : "USD1"}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
