"use client";

import { useState, useEffect } from "react";

interface PriceHistoryProps {
  cardName?: string;
  category?: string;
  grade?: string;
}

export default function PriceHistory({ cardName, category, grade }: PriceHistoryProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [chartUrl, setChartUrl] = useState<string | null>(null);
  const [imageLoaded, setImageLoaded] = useState(false);
  const [salesCount, setSalesCount] = useState<number | null>(null);

  const shouldShow = category === "TCG_CARDS" || category === "SPORTS_CARDS" || category === "WATCHES";

  useEffect(() => {
    if (!shouldShow || !cardName) {
      setChartUrl(null);
      return;
    }

    const fetchChart = async () => {
      setLoading(true);
      setError(null);
      setImageLoaded(false);
      setChartUrl(null);
      setSalesCount(null);

      try {
        // Step 1: Search for card variants
        const searchRes = await fetch(
          `/api/oracle?endpoint=search&q=${encodeURIComponent(cardName)}`,
          { signal: AbortSignal.timeout(15000) }
        );
        if (!searchRes.ok) throw new Error("Search failed");
        const searchData = await searchRes.json();

        if (!searchData.variants || searchData.variants.length === 0) {
          // Fallback: try with just card name keywords
          setError("No price data found");
          setLoading(false);
          return;
        }

        const chosen = searchData.variants[0];

        // Step 2: Get transaction count
        if (chosen.assetId) {
          try {
            const txRes = await fetch(
              `/api/oracle?endpoint=transactions&assetId=${encodeURIComponent(chosen.assetId)}`,
              { signal: AbortSignal.timeout(10000) }
            );
            if (txRes.ok) {
              const txData = await txRes.json();
              setSalesCount(txData.count || txData.transactions?.length || null);
            }
          } catch {}
        }

        // Step 3: Build chart URL (rendered server-side as PNG)
        const chartParams = new URLSearchParams();
        chartParams.set("endpoint", "chart");
        chartParams.set("q", cardName);
        // Don't pass grade filter — too restrictive, often returns 0 results
        
        setChartUrl(`/api/oracle?${chartParams.toString()}`);
        setLoading(false);
      } catch (err: any) {
        console.error("Price history error:", err);
        setError(err.message || "Unable to load price data");
        setChartUrl(null);
        setLoading(false);
      }
    };

    fetchChart();
  }, [cardName, category, grade, shouldShow]);

  if (!shouldShow) return null;

  if (loading) {
    return (
      <div className="bg-dark-800 rounded-lg border border-white/10 p-8 mb-8">
        <h2 className="text-white font-serif text-xl mb-4">Price History</h2>
        <div className="animate-pulse space-y-4">
          <div className="h-64 bg-dark-900 rounded-lg"></div>
        </div>
      </div>
    );
  }

  if (error && !chartUrl) {
    return (
      <div className="bg-dark-800 rounded-lg border border-white/10 p-8 mb-8">
        <h2 className="text-white font-serif text-xl mb-4">Price History</h2>
        <div className="text-gray-400 text-sm p-6 bg-dark-900 rounded-lg border border-white/5 text-center">
          <p>📊 Price data unavailable</p>
          <p className="text-xs text-gray-500 mt-2">{error}</p>
        </div>
      </div>
    );
  }

  if (!chartUrl) return null;

  return (
    <div className="bg-dark-800 rounded-lg border border-white/10 p-8 mb-8">
      <div className="flex items-center justify-between gap-4 mb-6">
        <h2 className="text-white font-serif text-xl">Price History</h2>
        <div className="flex items-center gap-3">
          {salesCount !== null && (
            <span className="text-xs text-gray-500">{salesCount} sales tracked</span>
          )}
          <span className="text-xs text-gray-500 font-medium">Powered by Artifacte Oracle</span>
        </div>
      </div>

      <div className="relative rounded-lg overflow-hidden border border-white/5 bg-dark-900">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={chartUrl}
          alt="Price History Chart"
          onLoad={() => setImageLoaded(true)}
          onError={() => setError("Chart unavailable")}
          className={`w-full h-auto transition-opacity duration-300 ${imageLoaded ? "opacity-100" : "opacity-0"}`}
          style={{ minHeight: "200px" }}
        />
        {!imageLoaded && !error && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="animate-pulse text-gray-500 text-sm">Generating chart...</div>
          </div>
        )}
      </div>
    </div>
  );
}
