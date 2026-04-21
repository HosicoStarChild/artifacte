"use client";

import Link from "next/link";
import { Auction, formatPrice } from "@/lib/data";
import Countdown from "./Countdown";
import VerifiedBadge from "./VerifiedBadge";

export default function AuctionCard({ auction }: { auction: Auction }) {
  return (
    <Link href={`/auctions/${auction.slug}`} className="card-hover block min-w-[300px] shrink-0">
      <div className="bg-dark-800 rounded-lg overflow-hidden border border-white/5 h-full flex flex-col">
        <div className="relative aspect-square overflow-hidden bg-dark-900">
          <img src={auction.image} alt={auction.name} className="w-full h-full object-cover group-hover:scale-105 transition duration-500" />
          {/* Status badges */}
          <div className="absolute top-4 left-4 flex items-center gap-2">
            <span className="bg-red-600/95 text-white text-xs font-semibold px-2.5 py-1 rounded-lg flex items-center gap-1.5 backdrop-blur-xs">
              <span className="w-1.5 h-1.5 rounded-full bg-white pulse-gold" />
              LIVE
            </span>
            <span className="bg-dark-900/80 text-gold-500 text-xs font-mono px-2.5 py-1 rounded-lg backdrop-blur-xs">
              <Countdown endTime={auction.end_time} />
            </span>
          </div>
        </div>
        <div className="p-5 flex-1 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between gap-2 mb-3">
              <span className="text-xs font-semibold tracking-widest text-gold-500 uppercase">Live Auction</span>
              <VerifiedBadge collectionName={auction.name} verifiedBy={auction.verifiedBy} />
            </div>
            <h3 className="text-white font-medium text-base mb-1">{auction.name}</h3>
            <p className="text-gray-500 text-xs mb-1">{auction.subtitle}{auction.verifiedBy ? ` • ${auction.verifiedBy} Verified` : ""}</p>
            <p className="text-gray-600 text-xs mb-4">{auction.category?.replace(/_/g, " ")}</p>
          </div>
          <div className="space-y-4">
            <div>
              <p className="text-gray-500 text-xs font-medium tracking-wider mb-1">Current Bid</p>
              <p className="text-white font-serif text-2xl">{auction.category === "DIGITAL_ART" ? `◎ ${auction.current_bid.toLocaleString()}` : formatPrice(auction.current_bid)}</p>
              <p className="text-gold-500 text-xs mt-1">{auction.current_bid.toLocaleString()} {auction.category === "DIGITAL_ART" ? "SOL" : "USD1"}</p>
            </div>
          </div>
        </div>
      </div>
    </Link>
  );
}
