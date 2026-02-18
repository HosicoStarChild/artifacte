"use client";

import Link from "next/link";
import { Auction, formatPrice } from "@/lib/data";
import Countdown from "./Countdown";

export default function AuctionCard({ auction }: { auction: Auction }) {
  return (
    <Link href={`/auctions/${auction.slug}`} className="card-hover block min-w-[300px] flex-shrink-0">
      <div className="bg-navy-800 rounded-xl overflow-hidden border border-white/5 h-full">
        <div className="relative h-52 overflow-hidden">
          <img src={auction.image} alt={auction.name} className="w-full h-full object-cover" />
          <div className="absolute top-3 left-3 flex items-center gap-2">
            <span className="bg-red-500/90 text-white text-[10px] font-bold px-2 py-0.5 rounded flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-white pulse-gold" />
              LIVE
            </span>
            <span className="bg-navy-900/80 text-white text-[10px] font-mono px-2 py-0.5 rounded">
              <Countdown endTime={auction.end_time} />
            </span>
          </div>
        </div>
        <div className="p-4">
          <p className="text-gold-400 text-[10px] font-bold tracking-wider mb-1">{auction.subtitle}</p>
          <h3 className="text-white font-medium text-sm mb-3">{auction.name}</h3>
          <div>
            <p className="text-gray-500 text-[10px] uppercase tracking-wider">Current Bid</p>
            <p className="text-white font-semibold text-lg">{formatPrice(auction.current_bid)}</p>
          </div>
        </div>
      </div>
    </Link>
  );
}
