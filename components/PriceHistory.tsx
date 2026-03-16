"use client";

import { useState, useEffect } from "react";

/**
 * Extract a simple search query from verbose CC/ME card names.
 * Used as fallback for chart endpoint when valuate doesn't return an assetId.
 */
function buildSearchQuery(name: string): string {
  // 1. Extract full card number like #OP05-119, OP11-118, OP05119
  const opMatch = name.match(/#?((?:OP|ST|EB|PRB?)\d+-\d+)/i) || name.match(/#?((?:OP|ST|EB|PRB?)\d{5,})/i);
  if (opMatch) {
    let cardNum = opMatch[1];
    if (!cardNum.includes('-')) {
      const m = cardNum.match(/^([A-Z]+\d{2})(\d+)$/i);
      if (m) cardNum = `${m[1]}-${m[2]}`;
    }
    return cardNum;
  }

  // 2. Extract Pokemon set codes
  const pkMatch = name.match(/#?((?:SV|SM|XY|BW|DP|EX|SWSH|sv|S|s)\d*[-/]\d+[-/]?[A-Z]*)/i);
  if (pkMatch) return pkMatch[1];

  // 3. Extract card number with set prefix
  const hashMatch = name.match(/#(\d+(?:\/[\w-]+)?)/);
  if (hashMatch) {
    const setPrefix = name.match(/\b(OP|ST|EB|PRB?)\d{2}/i);
    if (setPrefix) return `${setPrefix[0]}-${hashMatch[1]}`;
  }

  // 4. Generic cleanup
  let q = name
    .replace(/\b(PSA|CGC|BGS|SGC)\s*\d+\.?\d*/gi, '')
    .replace(/\b(GEM[- ]?MT|MINT|PRISTINE|NEAR MINT)\b/gi, '')
    .replace(/\b\d{4}\b/g, '')
    .replace(/\b(Pokemon|One Piece|Yu-Gi-Oh|Magic|Dragon Ball|Vibes|TCG)\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
  const words = q.split(' ').filter(w => w.length > 2);
  if (words.length > 5) q = words.slice(0, 5).join(' ');
  return q || name.slice(0, 50);
}

interface PriceHistoryProps {
  cardName?: string;
  category?: string;
  grade?: string;
  year?: number | string;
  nftAddress?: string;
}

function normalizeGrade(g?: string): string | undefined {
  if (!g) return undefined;
  let normalized = g.trim()
    .replace(/^Beckett\s*/i, 'BGS ')
    .replace(/^Professional Sports Authenticator\s*/i, 'PSA ')
    .replace(/^Certified Guaranty Company\s*/i, 'CGC ');
  normalized = normalized.replace(/^(PSA|BGS|CGC|SGC)\s+/i, (_, co) => `${co.toUpperCase()}-`);
  return normalized;
}

export default function PriceHistory({ cardName, category, grade: rawGrade, year, nftAddress }: PriceHistoryProps) {
  const grade = normalizeGrade(rawGrade);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [chartUrl, setChartUrl] = useState<string | null>(null);
  const [imageLoaded, setImageLoaded] = useState(false);
  const [salesCount, setSalesCount] = useState<number | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [ungradedPrice, setUngradedPrice] = useState<{ name: string; marketPrice: number; lowestPrice: number; rarity: string } | null>(null);
  const [sealedPrice, setSealedPrice] = useState<{ name: string; marketPrice: number; lowestPrice: number; tcg: string } | null>(null);
  const [valuateResult, setValuateResult] = useState<{ value: number; method: string; variety: string; confidence: string } | null>(null);

  const shouldShow = category === "TCG_CARDS" || category === "SPORTS_CARDS" || category === "WATCHES" || category === "SEALED";

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
      setSealedPrice(null);
      setValuateResult(null);

      try {
        // Sealed products: fetch TCGplayer market price instead of graded chart
        if (category === "SEALED") {
          const cleanName = cardName
            .replace(/\b(PSA|CGC|BGS)\s*\d+/gi, '')
            .replace(/\b\d{4}\b/g, '')
            .replace(/\b(Collector Crypt|collector_crypt)\b/gi, '')
            .trim();
          
          const sealedRes = await fetch(
            `/api/oracle?endpoint=sealed&q=${encodeURIComponent(cleanName)}`,
            { signal: AbortSignal.timeout(10000) }
          );
          if (sealedRes.ok) {
            const sealedData = await sealedRes.json();
            if (sealedData.results?.length > 0) {
              const best = sealedData.results[0];
              setSealedPrice({ name: best.name, marketPrice: best.marketPrice, lowestPrice: best.lowestPrice, tcg: best.tcg });
            } else {
              setError("No sealed price data found");
            }
          } else {
            setError("Sealed price lookup failed");
          }
          setLoading(false);
          return;
        }

        // Step 1: Call V3.5 valuate endpoint for smart variant selection
        let assetId: string | null = null;
        try {
          const valRes = await fetch(
            `/api/oracle?endpoint=valuate&name=${encodeURIComponent(cardName)}`,
            { signal: AbortSignal.timeout(15000) }
          );
          if (valRes.ok) {
            const valData = await valRes.json();
            if (valData.assetId) {
              assetId = valData.assetId;
              setValuateResult({
                value: valData.value,
                method: valData.method,
                variety: valData.variety,
                confidence: valData.confidence,
              });
              if (valData.count) setSalesCount(valData.count);
            }
          }
        } catch {
          // Valuate failed — fall through to old search path
        }

        // Step 2: Build chart URL
        const chartParams = new URLSearchParams();
        chartParams.set("endpoint", "chart");
        if (assetId) {
          // V3.5 selected the right variant — pass assetId directly to chart
          chartParams.set("assetId", assetId);
        } else {
          // Fallback: use old search query extraction
          chartParams.set("q", buildSearchQuery(cardName));
        }
        if (grade) chartParams.set("grade", grade);
        // Pass card name for chart title
        chartParams.set("card", cardName);

        setChartUrl(`/api/oracle?${chartParams.toString()}`);
        setLoading(false);

        // Fetch ungraded NM price (non-blocking)
        try {
          const cardNum = cardName.match(/#?((?:OP|ST|EB|PRB?)\d+-\d+)/i)?.[1]
            || cardName.match(/#?((?:SV|SM|XY|BW|DP|EX|SWSH)\d*[-/]\d+)/i)?.[1];
          if (cardNum) {
            const ugParams = new URLSearchParams({ endpoint: "ungraded", number: cardNum, ccName: cardName });
            const ugRes = await fetch(`/api/oracle?${ugParams.toString()}`, { signal: AbortSignal.timeout(10000) });
            if (ugRes.ok) {
              const ugData = await ugRes.json();
              if (ugData.found && ugData.marketPrice) {
                setUngradedPrice({ name: ugData.name, marketPrice: ugData.marketPrice, lowestPrice: ugData.lowestPrice, rarity: ugData.rarity });
              }
            }
          }
        } catch {}
      } catch (err: any) {
        console.error("Price history error:", err);
        setError(err.message || "Unable to load price data");
        setChartUrl(null);
        setLoading(false);
      }
    };

    fetchChart();
  }, [cardName, category, grade, nftAddress, shouldShow]);

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

  // Sealed product pricing display
  if (category === "SEALED" && sealedPrice) {
    return (
      <div className="bg-dark-800 rounded-lg border border-white/10 p-8 mb-8">
        <div className="flex items-center justify-between gap-4 mb-6">
          <h2 className="text-white font-serif text-xl">Market Price</h2>
          <span className="text-xs text-gray-500 font-medium">Powered by Artifacte Oracle</span>
        </div>
        <div className="bg-dark-900 rounded-lg border border-white/5 p-5">
          <div className="flex items-center justify-between mb-3">
            <span className="text-gray-400 text-sm">TCGplayer Market Price</span>
            <span className="text-white text-2xl font-semibold">${sealedPrice.marketPrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
          </div>
          {sealedPrice.lowestPrice && (
            <div className="flex items-center justify-between mb-3">
              <span className="text-gray-500 text-sm">Lowest Listed</span>
              <span className="text-gray-300">${sealedPrice.lowestPrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
            </div>
          )}
          <div className="pt-3 border-t border-white/5">
            <p className="text-gray-600 text-xs">{sealedPrice.name} • {sealedPrice.tcg}</p>
          </div>
        </div>
      </div>
    );
  }

  if (category === "SEALED" && !sealedPrice && !loading) return null;

  if (error && !chartUrl && !sealedPrice) {
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

      <div
        className="relative rounded-lg overflow-hidden border border-white/5 bg-dark-900 cursor-pointer"
        onClick={() => setExpanded(true)}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={chartUrl}
          alt="Price History Chart"
          onLoad={() => setImageLoaded(true)}
          onError={() => {
            // If grade-filtered chart fails, retry without grade filter (shows all grades)
            if (grade && chartUrl?.includes('grade=')) {
              const fallbackUrl = chartUrl.replace(/&?grade=[^&]*/g, '');
              setChartUrl(fallbackUrl);
              setImageLoaded(false);
            } else {
              setError("Chart unavailable");
              setChartUrl(null);
            }
          }}
          className={`w-full h-auto transition-opacity duration-300 ${imageLoaded ? "opacity-100" : "opacity-0"}`}
          style={{ minHeight: "200px" }}
        />
        {!imageLoaded && !error && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="animate-pulse text-gray-500 text-sm">Generating chart...</div>
          </div>
        )}
        {imageLoaded && (
          <div className="absolute bottom-2 right-2 text-xs text-gray-500 bg-dark-900/80 px-2 py-1 rounded">
            Tap to expand
          </div>
        )}
      </div>

      {/* Ungraded NM price */}
      {ungradedPrice && (
        <div className="mt-4 flex items-center justify-between bg-dark-900 rounded-lg border border-white/5 px-4 py-3">
          <div>
            <span className="text-gray-400 text-sm">NM Ungraded</span>
            <span className="text-gray-600 text-xs ml-2">({ungradedPrice.name})</span>
          </div>
          <div className="text-right">
            <span className="text-white font-medium">${ungradedPrice.marketPrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
            <span className="text-gray-500 text-xs ml-2">market</span>
          </div>
        </div>
      )}

      {/* Fullscreen lightbox */}
      {expanded && (
        <div
          className="fixed inset-0 z-50 bg-black/90 backdrop-blur-sm flex items-center justify-center p-4 cursor-pointer"
          onClick={() => setExpanded(false)}
        >
          <div className="relative w-full max-w-6xl" onClick={(e) => e.stopPropagation()}>
            <button
              onClick={() => setExpanded(false)}
              className="absolute -top-3 -right-3 z-10 bg-dark-800 border border-white/20 rounded-full w-8 h-8 flex items-center justify-center text-white hover:bg-dark-700 transition-colors"
            >
              ✕
            </button>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={chartUrl}
              alt="Price History Chart"
              className="w-full h-auto rounded-lg"
            />
            <div className="text-center mt-3 text-gray-500 text-sm">Click anywhere to close</div>
          </div>
        </div>
      )}
    </div>
  );
}
