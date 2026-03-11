"use client";

import { useState, useEffect } from "react";

/**
 * Extract search-friendly query from verbose CC/ME card names.
 * E.g. "2015 Pokemon Japanese XY Promo Poncho-wearing Pikachu #150/XY-P PSA 10"
 *   → "Pikachu Poncho 150 XY-P"
 * E.g. "2023 One Piece OP05 Awakening SEC Monkey D. Luffy #OP05-119 PSA 10"
 *   → "OP05-119"
 */
// Manual overrides for cards where ME listing names are too generic to match correctly
const CHART_OVERRIDES: Record<string, string> = {
  '2022 #001 Monkey D. Luffy PSA 10 One Piece Promos': 'P-001 super pre-release winner luffy',
};

function buildSearchQuery(name: string): string {
  // Check manual overrides first
  if (CHART_OVERRIDES[name]) return CHART_OVERRIDES[name];

  // 1. Extract full card number like #OP05-119, OP11-118, OP05119 (must have dash or 5+ digits)
  const opMatch = name.match(/#?((?:OP|ST|EB|PRB?)\d+-\d+)/i) || name.match(/#?((?:OP|ST|EB|PRB?)\d{5,})/i);
  if (opMatch) {
    // Normalize: insert dash if missing (OP05119 → OP05-119)
    let cardNum = opMatch[1];
    if (!cardNum.includes('-')) {
      const m = cardNum.match(/^([A-Z]+\d{2})(\d+)$/i);
      if (m) cardNum = `${m[1]}-${m[2]}`;
    }
    // Include variant keywords for disambiguation (manga art vs alt art vs standard)
    const variant = name.match(/\b(manga|alt(?:ernate)?\s*art|super\s*pre.?release|winner|sp|sec)\b/i);
    return variant ? `${cardNum} ${variant[0]}` : cardNum;
  }

  // 2. Extract Pokemon set codes: SV06-061, SWSH12-150, XY-150
  const pkMatch = name.match(/#?((?:SV|SM|XY|BW|DP|EX|SWSH|sv|S|s)\d*[-/]\d+[-/]?[A-Z]*)/i);
  if (pkMatch) return pkMatch[1];

  // 3. Extract card number with # prefix: #051, #118, #150/XY-P
  const hashMatch = name.match(/#(\d+(?:\/[\w-]+)?)/);
  if (hashMatch) {
    // Check if set code like OP09, ST01, EB01 exists in the name (e.g. "OP09-Emperors in the New World")
    const setPrefix = name.match(/\b(OP|ST|EB|PRB?)\d{2}/i);
    if (setPrefix) {
      // Combine: OP09 + #051 → OP09-051, plus character name + variant for disambiguation
      const cardNum = `${setPrefix[0]}-${hashMatch[1]}`;
      const variant = name.match(/\b(manga|alt(?:ernate)?\s*art|wanted|super\s*pre.?release|winner|sp|sec|3rd\s*anniversary|gold|serialized|tournament)\b/i);
      // Also extract character name
      const charWords = name
        .replace(/\b\d{4}\b/g, '').replace(/#\d+/g, '')
        .replace(/\b(PSA|CGC|BGS|SGC)\s*\d+\.?\d*/gi, '')
        .replace(/\b(GEM[- ]?MT|MINT|PRISTINE|Japanese|English|JPN|EN)\b/gi, '')
        .replace(/\b(Pokemon|One Piece|Yu-Gi-Oh|Magic|Dragon Ball)\b/gi, '')
        .replace(/\b(OP|ST|EB)\d+[-\w]*/gi, '')
        .replace(/[\/|,-]/g, ' ')
        .trim().split(/\s+/).filter(w => w.length > 2 && /^[A-Z]/.test(w)).slice(0, 3);
      const parts = [cardNum, ...charWords];
      if (variant) parts.push(variant[0]);
      return parts.join(' ');
    }
    // Build query from card number + name context
    const parts: string[] = [];
    // Extract character/card name (first 1-3 capitalized words before common keywords)
    const cleanName = name
      .replace(/[\/|]/g, ' ')
      .replace(/\b\d{4}\b/g, '')
      .replace(/#\d+/g, '')
      .replace(/\b(PSA|CGC|BGS|SGC)\s*\d+\.?\d*/gi, '')
      .replace(/\b(GEM[- ]?MT|MINT|PRISTINE)\b/gi, '')
      .replace(/\b(Japanese|English|JPN|EN)\b/gi, '')
      .replace(/\b(Pokemon|One Piece|Yu-Gi-Oh|Magic|Dragon Ball)\b/gi, '')
      .replace(/\b(Promos?|Promo|FULL ART|SPECIAL BOX)\b/gi, '')
      .replace(/-HOLO\b/gi, '')
      .replace(/-/g, ' ')
      .trim();
    // Get meaningful words (character name, set identifiers, etc.)
    const words = cleanName.split(/\s+/).filter(w => w.length > 2 && /^[A-Z]/.test(w));
    if (words.length > 0) parts.push(...words.slice(0, 6));
    parts.push(hashMatch[1]);
    // Add TCG context
    if (/one piece/i.test(name)) parts.push('one piece');
    else if (/pokemon/i.test(name)) parts.push('pokemon');
    else if (/dragon ball/i.test(name)) parts.push('dragon ball');
    else if (/yu-?gi-?oh/i.test(name)) parts.push('yugioh');
    return parts.join(' ');
  }

  // 4. Clean up name for freetext search
  let q = name
    .replace(/\b(PSA|CGC|BGS|SGC)\s*\d+\.?\d*/gi, '')
    .replace(/\b(GEM[- ]?MT|MINT|PRISTINE|NEAR MINT)\b/gi, '')
    .replace(/\b\d{4}\b/g, '') // years
    .replace(/\b(Pokemon|One Piece|Yu-Gi-Oh|Magic|Dragon Ball|Vibes|TCG)\b/gi, '')
    .replace(/\b(Japanese|English|Chinese|Korean|JPN|EN)\b/gi, '')
    .replace(/\b(1st Edition|Unlimited|Shadowless|Holo|Reverse)\b/gi, '')
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

export default function PriceHistory({ cardName, category, grade, year, nftAddress }: PriceHistoryProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [chartUrl, setChartUrl] = useState<string | null>(null);
  const [imageLoaded, setImageLoaded] = useState(false);
  const [salesCount, setSalesCount] = useState<number | null>(null);
  const [expanded, setExpanded] = useState(false);

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
        let assetId: string | null = null;

        // Strategy 1: Use pre-computed oracle mapping (same data as portfolio values)
        try {
          const mappingParams = new URLSearchParams();
          mappingParams.set("endpoint", "chart-id");
          if (cardName) mappingParams.set("name", cardName);
          if (nftAddress) mappingParams.set("nft", nftAddress);
          if (grade) mappingParams.set("grade", grade);

          const mappingRes = await fetch(`/api/oracle?${mappingParams.toString()}`, {
            signal: AbortSignal.timeout(8000),
          });
          if (mappingRes.ok) {
            const mapping = await mappingRes.json();
            if (mapping.altAssetId) {
              assetId = mapping.altAssetId;
            }
          }
        } catch {}

        // Strategy 2: Fall back to live search if no pre-computed mapping
        if (!assetId) {
          const searchQuery = buildSearchQuery(cardName);
          const searchRes = await fetch(
            `/api/oracle?endpoint=search&q=${encodeURIComponent(searchQuery)}`,
            { signal: AbortSignal.timeout(15000) }
          );
          if (searchRes.ok) {
            const searchData = await searchRes.json();
            if (searchData.variants?.length > 0) {
              assetId = searchData.variants[0].assetId;
            }
          }
        }

        if (!assetId) {
          setError("No price data found");
          setLoading(false);
          return;
        }

        // Get transaction count
        try {
          const txRes = await fetch(
            `/api/oracle?endpoint=transactions&assetId=${encodeURIComponent(assetId)}`,
            { signal: AbortSignal.timeout(10000) }
          );
          if (txRes.ok) {
            const txData = await txRes.json();
            setSalesCount(txData.count || txData.transactions?.length || null);
          }
        } catch {}

        // Build chart URL using assetId directly (guaranteed correct mapping)
        const chartParams = new URLSearchParams();
        chartParams.set("endpoint", "chart");
        chartParams.set("assetId", assetId);
        
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

      <div
        className="relative rounded-lg overflow-hidden border border-white/5 bg-dark-900 cursor-pointer"
        onClick={() => setExpanded(true)}
      >
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
        {imageLoaded && (
          <div className="absolute bottom-2 right-2 text-xs text-gray-500 bg-dark-900/80 px-2 py-1 rounded">
            Tap to expand
          </div>
        )}
      </div>

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
