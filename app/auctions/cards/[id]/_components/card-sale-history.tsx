"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

type TensorSaleHistoryItem = {
  buyer: string | null;
  currency: string;
  marketplace: string | null;
  price: number | null;
  seller: string | null;
  signature: string;
  timestamp: number | null;
};

type TensorSaleHistoryResponse = {
  items?: TensorSaleHistoryItem[];
};

interface CardSaleHistoryProps {
  mint: string | null | undefined;
}

function shortenAddress(value: string | null): string {
  if (!value) {
    return "—";
  }

  return `${value.slice(0, 4)}…${value.slice(-4)}`;
}

function formatDate(timestamp: number | null): string {
  if (!timestamp) {
    return "Unknown date";
  }

  return new Intl.DateTimeFormat("en-US", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(timestamp * 1000));
}

function formatPrice(item: TensorSaleHistoryItem): string {
  if (item.price === null) {
    return "Price unavailable";
  }

  const formatter = new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 3,
    minimumFractionDigits: item.price < 1 ? 3 : 0,
  });

  return `${formatter.format(item.price)} ${item.currency}`;
}

export function CardSaleHistory({ mint }: CardSaleHistoryProps) {
  const [items, setItems] = useState<TensorSaleHistoryItem[]>([]);
  const [loading, setLoading] = useState(Boolean(mint));

  useEffect(() => {
    if (!mint) {
      setItems([]);
      setLoading(false);
      return;
    }

    const controller = new AbortController();
    setLoading(true);

    fetch(`/api/tensor-sale-history?mint=${encodeURIComponent(mint)}`, {
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(`Sale history request failed with status ${response.status}`);
        }

        return (await response.json()) as TensorSaleHistoryResponse;
      })
      .then((payload) => {
        setItems(payload.items ?? []);
      })
      .catch((error) => {
        if (error instanceof Error && error.name === "AbortError") {
          return;
        }

        console.error("[card-sale-history] Failed to load sale history", error);
        setItems([]);
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      });

    return () => {
      controller.abort();
    };
  }, [mint]);

  return (
    <Card className="border-white/10 bg-dark-800/90 py-0">
      <section className="space-y-4 p-6">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="font-serif text-2xl text-white">Sale History</h2>
            <p className="mt-1 text-sm text-white/45">Recent Tensor and Collector Crypt indexed sales for this card NFT.</p>
          </div>
          <Badge className="border-white/10 bg-white/5 text-white/70">
            {loading ? "Loading" : items.length ? `${items.length} found` : "No sales"}
          </Badge>
        </div>

        {items.length ? (
          <div className="overflow-hidden rounded-2xl border border-white/10">
            <div className="hidden grid-cols-[1fr_1fr_1fr_1fr_auto] gap-4 border-b border-white/10 bg-white/[0.03] px-4 py-3 text-xs uppercase tracking-[0.2em] text-white/35 md:grid">
              <span>Date</span>
              <span>Price</span>
              <span>Seller</span>
              <span>Buyer</span>
              <span className="text-right">Tx</span>
            </div>
            <div className="divide-y divide-white/10">
              {items.map((item) => (
                <div
                  key={item.signature}
                  className="grid gap-3 px-4 py-4 text-sm text-white/70 md:grid-cols-[1fr_1fr_1fr_1fr_auto] md:items-center"
                >
                  <div>
                    <p className="text-white">{formatDate(item.timestamp)}</p>
                    {item.marketplace ? (
                      <p className="mt-1 text-xs text-white/35">{item.marketplace}</p>
                    ) : null}
                  </div>
                  <p className="font-mono text-gold-300">{formatPrice(item)}</p>
                  <p className="font-mono text-white/55">{shortenAddress(item.seller)}</p>
                  <p className="font-mono text-white/55">{shortenAddress(item.buyer)}</p>
                  <Link
                    href={`https://solscan.io/tx/${item.signature}`}
                    target="_blank"
                    rel="noreferrer"
                    className={cn(
                      "text-left text-xs font-semibold uppercase tracking-[0.2em] text-gold-400 transition hover:text-gold-300 md:text-right",
                    )}
                  >
                    View
                  </Link>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-8 text-center">
            <p className="text-sm text-white/55">
              {loading ? "Loading public sale history…" : "No public sale history found for this card yet."}
            </p>
          </div>
        )}
      </section>
    </Card>
  );
}
