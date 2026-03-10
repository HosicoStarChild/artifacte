"use client";

import { useState, useEffect } from "react";
import Image from "next/image";

interface PriceHistoryProps {
  cardName?: string;
  category?: string;
  grade?: string;
}

interface SearchResult {
  id?: string;
  name?: string;
  set?: string;
  number?: string;
  variants?: string[];
  [key: string]: any;
}

interface ChartData {
  avgPrice?: number;
  trend?: string;
  salesCount?: number;
  [key: string]: any;
}

export default function PriceHistory({ cardName, category, grade }: PriceHistoryProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [chartUrl, setChartUrl] = useState<string | null>(null);
  const [chartData, setChartData] = useState<ChartData | null>(null);
  const [imageLoaded, setImageLoaded] = useState(false);

  // Show for TCG_CARDS, SPORTS_CARDS, and WATCHES
  const shouldShow = category === "TCG_CARDS" || category === "SPORTS_CARDS" || category === "WATCHES";

  useEffect(() => {
    if (!shouldShow || !cardName) {
      setChartUrl(null);
      setChartData(null);
      return;
    }

    const fetchPriceHistory = async () => {
      setLoading(true);
      setError(null);
      setImageLoaded(false);
      setChartData(null);

      try {
        // Search pre-computed market data by card name
        const searchResponse = await fetch(
          `/api/oracle?endpoint=market-search&q=${encodeURIComponent(cardName)}`,
          { method: "GET", signal: AbortSignal.timeout(15000) }
        );

        if (!searchResponse.ok) {
          throw new Error("Failed to search oracle");
        }

        const data = await searchResponse.json();

        if (!data.prices || data.prices.length === 0) {
          setError("Card not found in oracle database");
          setLoading(false);
          return;
        }

        // Use the best match
        const match = data.prices[0];
        setChartData({
          avgPrice: match.marketValue,
          trend: match.lastSalePrice && match.marketValue
            ? (match.marketValue >= match.lastSalePrice ? "↑ Stable" : "↓ Declining")
            : undefined,
          salesCount: match.salesCount,
        });

        // No chart image for now — show stats only
        setChartUrl(null);
        setLoading(false);
      } catch (err: any) {
        console.error("Price history error:", err);
        setError(err.message || "Unable to load price data");
        setChartUrl(null);
        setChartData(null);
        setLoading(false);
      }
    };

    fetchPriceHistory();
  }, [cardName, category, grade, shouldShow]);

  if (!shouldShow) {
    return null;
  }

  if (loading && !chartUrl) {
    return (
      <div className="bg-dark-800 rounded-lg border border-white/10 p-8 mb-8">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-white font-serif text-xl">Price History</h2>
        </div>
        <div className="animate-pulse space-y-4">
          <div className="h-64 bg-dark-900 rounded-lg"></div>
          <div className="h-4 bg-dark-900 rounded w-3/4"></div>
          <div className="h-4 bg-dark-900 rounded w-1/2"></div>
        </div>
      </div>
    );
  }

  if (error && !chartData) {
    return (
      <div className="bg-dark-800 rounded-lg border border-white/10 p-8 mb-8">
        <h2 className="text-white font-serif text-xl mb-4">Price History</h2>
        <div className="text-gray-400 text-sm p-6 bg-dark-900 rounded-lg border border-white/5 text-center">
          <p>📊 Price data unavailable</p>
          {error && <p className="text-xs text-gray-500 mt-2">{error}</p>}
        </div>
      </div>
    );
  }

  return (
    <div className="bg-dark-800 rounded-lg border border-white/10 p-8 mb-8">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 mb-6">
        <h2 className="text-white font-serif text-xl">Price History</h2>
        <span className="text-xs text-gray-500 font-medium">Powered by Artifacte Oracle</span>
      </div>

      {/* Chart Image */}
      {chartUrl && (
        <div className="mb-6 rounded-lg overflow-hidden border border-white/5 bg-dark-900 flex items-center justify-center">
          <img
            src={chartUrl}
            alt="Price History Chart"
            onLoad={() => setImageLoaded(true)}
            className={`w-full h-auto transition-opacity duration-300 ${imageLoaded ? "opacity-100" : "opacity-0"}`}
            style={{ minHeight: "300px" }}
          />
          {!imageLoaded && (
            <div className="absolute inset-0 flex items-center justify-center bg-dark-900">
              <div className="animate-pulse text-gray-500 text-sm">Loading chart...</div>
            </div>
          )}
        </div>
      )}

      {/* Stats */}
      {chartData && (
        <div className="grid grid-cols-3 gap-4">
          {chartData.avgPrice !== undefined && (
            <div className="bg-dark-900 rounded-lg p-4 border border-white/5">
              <p className="text-gray-500 text-xs font-medium tracking-wide mb-2">Avg Price</p>
              <p className="text-white font-serif text-lg">
                {typeof chartData.avgPrice === "number"
                  ? `$${chartData.avgPrice.toFixed(2)}`
                  : "—"}
              </p>
            </div>
          )}
          {chartData.trend && (
            <div className="bg-dark-900 rounded-lg p-4 border border-white/5">
              <p className="text-gray-500 text-xs font-medium tracking-wide mb-2">3-Mo Trend</p>
              <p className={`font-serif text-lg ${chartData.trend.includes("↑") ? "text-green-400" : "text-red-400"}`}>
                {chartData.trend}
              </p>
            </div>
          )}
          {chartData.salesCount !== undefined && (
            <div className="bg-dark-900 rounded-lg p-4 border border-white/5">
              <p className="text-gray-500 text-xs font-medium tracking-wide mb-2">Sales</p>
              <p className="text-white font-serif text-lg">{chartData.salesCount}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
