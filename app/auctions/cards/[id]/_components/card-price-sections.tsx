"use client";

import { useEffect, useState, type ReactNode } from "react";

import { Card, CardContent } from "@/components/ui/card";

import type { AuctionListing, CardDetail } from "../_lib/card-detail";

type TcgPlayerPriceResponse = {
  listedMedianPrice?: number | null;
  marketPrice?: number | null;
};

function getResolvedMarketPrice(payload: TcgPlayerPriceResponse): number | null {
  return payload.marketPrice || payload.listedMedianPrice || null;
}

export function TcgPlayerPriceBox({ productId }: { productId: string }) {
  const [price, setPrice] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;

    fetch(`/api/tcgplayer-price?id=${productId}`)
      .then(async (response) => {
        if (!response.ok) {
          return null;
        }

        return (await response.json()) as TcgPlayerPriceResponse;
      })
      .then((payload) => {
        if (cancelled || !payload) {
          return;
        }

        setPrice(getResolvedMarketPrice(payload));
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [productId]);

  return (
    <Card className="border-white/5 bg-dark-800 py-0">
      <CardContent className="space-y-2 px-6 py-6">
        <h3 className="text-sm font-medium tracking-wider text-white uppercase">Market Price</h3>
        <p className="font-serif text-3xl font-bold text-white">
          {price ? `$${price.toFixed(2)}` : "Loading..."}
        </p>
        <p className="text-xs text-gray-500">Current market price per TCGplayer</p>
      </CardContent>
    </Card>
  );
}

export function ArtifactePriceSection({ card, children }: { card: CardDetail; children?: ReactNode }) {
  const [marketPrice, setMarketPrice] = useState<number | null>(null);

  useEffect(() => {
    if (!card.priceSourceId || card.priceSource !== "TCGplayer") {
      return;
    }

    let cancelled = false;

    fetch(`/api/tcgplayer-price?id=${card.priceSourceId}`)
      .then(async (response) => {
        if (!response.ok) {
          return null;
        }

        return (await response.json()) as TcgPlayerPriceResponse;
      })
      .then((payload) => {
        if (cancelled || !payload) {
          return;
        }

        setMarketPrice(getResolvedMarketPrice(payload));
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [card.priceSource, card.priceSourceId]);

  const auctionListing: AuctionListing | null = card.auctionListing ?? null;
  const hasListing = Boolean(auctionListing || card.price);

  return (
    <Card className="border-white/5 bg-dark-800 py-0">
      <CardContent className="space-y-4 px-6 py-6">
        {hasListing ? (
          <div>
            <p className="mb-2 text-xs font-medium tracking-wider text-gray-500 uppercase">
              {auctionListing?.listingType === "auction" ? "Auction" : "Price"}
            </p>
            <div className="flex items-baseline gap-3">
              <p className="font-serif text-4xl text-white">
                {auctionListing ? (
                  auctionListing.currency === "SOL" ? `◎ ${auctionListing.price.toLocaleString()}` : `$${auctionListing.price.toLocaleString()}`
                ) : (
                  card.usdcPrice ? `$${card.usdcPrice.toLocaleString()}` : `◎ ${card.price.toLocaleString()}`
                )}
              </p>
              <span className="text-sm font-medium text-gold-500">{auctionListing?.currency || card.currency}</span>
            </div>
            {auctionListing?.listingType === "auction" && auctionListing.currentBid > 0 ? (
              <p className="mt-1 text-sm text-gold-400">
                Current bid: {auctionListing.currency === "SOL" ? "◎ " : "$"}
                {auctionListing.currentBid.toLocaleString()} {auctionListing.currency}
              </p>
            ) : null}
            {auctionListing?.listingType === "auction" && auctionListing.endTime > 0 ? (
              <p className="mt-1 text-sm text-gray-400">
                Ends: {new Date(auctionListing.endTime).toLocaleDateString()} {new Date(auctionListing.endTime).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
              </p>
            ) : null}
          </div>
        ) : (
          <div>
            <p className="mb-2 text-xs font-medium tracking-wider text-gray-500 uppercase">Status</p>
            <p className="font-serif text-4xl text-white">Unlisted</p>
          </div>
        )}

        <div>
          <p className="mb-2 text-xs font-medium tracking-wider text-gray-500 uppercase">Market Price</p>
          <div className="mb-2 flex items-baseline gap-3">
            <p className="font-serif text-2xl text-white">{marketPrice ? `$${marketPrice.toFixed(2)}` : "—"}</p>
            {card.priceSource ? <span className="text-xs font-medium text-gold-500">via {card.priceSource}</span> : null}
          </div>
        </div>

        <div className="flex flex-wrap gap-3 text-xs text-gray-400">
          {card.variant ? <span className="rounded bg-dark-700 px-2 py-1">{card.variant}</span> : null}
          {card.language ? <span className="rounded bg-dark-700 px-2 py-1">{card.language}</span> : null}
          {card.grade ? <span className="rounded bg-dark-700 px-2 py-1">{card.grade}</span> : null}
          <span className="rounded bg-dark-700 px-2 py-1">Artifacte Collection</span>
        </div>

        {card.price && !auctionListing ? (
          <p className="text-sm text-emerald-300">
            Artifacte collection items do not incur the 2% external Artifacte fee.
          </p>
        ) : null}

        {children}
      </CardContent>
    </Card>
  );
}