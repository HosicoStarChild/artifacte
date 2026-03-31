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
  '2022 #001 Monkey D. Luffy PSA 10 One Piece Promos': 'one piece luffy P-001 super prerelease winner',
  '2024 #019 Divine Departure PSA 10 One Piece Japanese OP10-Royal Blood': 'OP10019 divine depature Japanese',
  '2023 #092 Rob Lucci PSA 10 One Piece Japanese OP05-Awakening of the New Era Pokemon': 'OP05092 rob lucci japanese special alternate art',
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
        .replace(/\b(GEM[- ]?MT|MINT|PRISTINE|English|EN)\b/gi, '')
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
      .replace(/\b(English|EN)\b/gi, '')
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
    .replace(/\b(English|EN)\b/gi, '')
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
  source?: string;
  tcgPlayerId?: string;
  gradingId?: string;
  gradingCompany?: string;
}

function normalizeGrade(g?: string): string | undefined {
  if (!g) return undefined;
  // Normalize grading company names to Alt.xyz format
  let normalized = g.trim()
    .replace(/^Beckett\s*/i, 'BGS ')
    .replace(/^Professional Sports Authenticator\s*/i, 'PSA ')
    .replace(/^Certified Guaranty Company\s*/i, 'CGC ');
  // Normalize space to dash: "PSA 10" → "PSA-10"
  normalized = normalized.replace(/^(PSA|BGS|CGC|SGC)\s+/i, (_, co) => `${co.toUpperCase()}-`);
  return normalized;
}

export default function PriceHistory({ cardName, category, grade: rawGrade, year, nftAddress, source, tcgPlayerId, gradingId, gradingCompany }: PriceHistoryProps) {
  const grade = normalizeGrade(rawGrade);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [chartUrl, setChartUrl] = useState<string | null>(null);
  const [imageLoaded, setImageLoaded] = useState(false);
  const [salesCount, setSalesCount] = useState<number | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [ungradedPrice, setUngradedPrice] = useState<{ name: string; marketPrice: number; lowestPrice: number; rarity: string } | null>(null);
  const [sealedPrice, setSealedPrice] = useState<{ name: string; marketPrice: number; lowestPrice: number; tcg: string } | null>(null);

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

      try {
        // Phygitals: fetch TCGplayer ungraded market price
        if (source === 'phygitals') {
          const cleanName = cardName
            .replace(/\b(Ungraded Card|POKEMON|phygitals?)\b/gi, '')
            .trim();
          
          const searchRes = await fetch(
            `/api/oracle?endpoint=search&q=${encodeURIComponent(cleanName)}`,
            { signal: AbortSignal.timeout(10000) }
          );
          if (searchRes.ok) {
            const searchData = await searchRes.json();
            if (searchData.variants?.length > 0) {
              // Find the ungraded/raw variant
              const ungraded = searchData.variants.find((v: any) => 
                !v.grade || v.grade === 'Ungraded' || v.grade === 'Raw'
              ) || searchData.variants[0];
              
              if (ungraded.marketPrice || ungraded.lowestPrice) {
                setSealedPrice({
                  name: ungraded.fullName || ungraded.name || cleanName,
                  marketPrice: ungraded.marketPrice || ungraded.lowestPrice || 0,
                  lowestPrice: ungraded.lowestPrice || 0,
                  tcg: ungraded.tcg || 'Pokemon',
                });
              } else {
                setError("No TCGplayer price data found");
              }
            } else {
              setError("No TCGplayer price data found");
            }
          }
          setLoading(false);
          return;
        }

        // Sealed products: fetch TCGplayer market price instead of graded chart
        if (category === "SEALED") {
          // Extract search terms from sealed product name
          // e.g. "Awakening of the New Era - Booster Box" from CC listing name
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

        // Cert-based lookup — get exact assetId (PSA/BGS) or matched card name (CGC)
        let certAssetId: string | null = null;
        let certValue: number | null = null;
        let certCardName: string | null = null;
        if (gradingId) {
          try {
            if (gradingCompany === 'PSA' || gradingCompany === 'BGS') {
              const certRes = await fetch(`/api/oracle?endpoint=cert&cert=${encodeURIComponent(gradingId)}`, { signal: AbortSignal.timeout(8000) });
              if (certRes.ok) {
                const certData = await certRes.json();
                if (certData.card?.assetId) certAssetId = certData.card.assetId;
                if (certData.card?.assetName) certCardName = certData.card.assetName;
                if (certData.value) certValue = certData.value;
              }
            } else if (gradingCompany === 'CGC') {
              // CGC: use the same valuateByCgcCert path as portfolio (with language filter)
              const gradeKey = grade || '';
              const cgcRes = await fetch(`/api/oracle?endpoint=cert-cgc&cert=${encodeURIComponent(gradingId)}&grade=${encodeURIComponent(gradeKey)}`, { signal: AbortSignal.timeout(8000) });
              if (cgcRes.ok) {
                const cgcData = await cgcRes.json();
                if (cgcData.assetId) certAssetId = cgcData.assetId;
                if (cgcData.matchedName) certCardName = cgcData.matchedName;
                else if (cgcData.card?.cardName) certCardName = [cgcData.card.cardName, cgcData.card.cardSet, cgcData.card.cardNumber].filter(Boolean).join(' ');
                if (cgcData.value) certValue = cgcData.value;
              }
            }
          } catch {}
        }

        // If CGC cert lookup gave us an assetId, skip search and go straight to chart
        if (certAssetId && gradingCompany === 'CGC') {
          const chartParams = new URLSearchParams();
          chartParams.set("endpoint", "chart");
          chartParams.set("assetId", certAssetId);
          if (grade) chartParams.set("grade", grade);
          if (certCardName) chartParams.set("q", certCardName);
          setChartUrl(`/api/oracle?${chartParams.toString()}`);
          setLoading(false);
          return;
        }

        // Live search using cert card name if available, otherwise build from CC name
        const searchQuery = certCardName ? certCardName : buildSearchQuery(cardName);

        const searchRes = await fetch(
          `/api/oracle?endpoint=search&q=${encodeURIComponent(searchQuery)}`,
          { signal: AbortSignal.timeout(15000) }
        );
        if (!searchRes.ok) throw new Error("Search failed");
        const searchData = await searchRes.json();

        if (!searchData.variants || searchData.variants.length === 0) {
          setError("No price data found");
          setLoading(false);
          return;
        }

        // Pick the variant that matches the card number from the name
        let chosen = searchData.variants[0];
        const cardNumMatch = cardName.match(/#(\w+)/);
        if (cardNumMatch && searchData.variants.length > 1) {
          const targetNum = cardNumMatch[1];
          const matchesNum = (cn: string) => cn === targetNum || cn.endsWith(`-${targetNum}`) || cn.endsWith(targetNum);
          const exactMatch = searchData.variants.find(
            (v: any) => matchesNum(String(v.cardNumber))
          );
          // If multiple variants share the same card number, further filter by variant type
          if (exactMatch) {
            const sameNumVariants = searchData.variants.filter(
              (v: any) => matchesNum(String(v.cardNumber))
            );
            if (sameNumVariants.length > 1) {
              const nameUpper = cardName.toUpperCase();
              const isReverse = /REVERSE/i.test(nameUpper);
              const isHolo = /HOLO/i.test(nameUpper) && !isReverse;
              
              // Filter by language first — CC names contain "Japanese"/"JPN" for JP cards
              const isCardJapanese = /JAPANESE|JPN|\bJP\b/i.test(cardName);
              let langFiltered = sameNumVariants;
              if (isCardJapanese) {
                const jpOnly = sameNumVariants.filter((v: any) => /JAPANESE/i.test(v.name || '') || /JAPANESE/i.test(v.brand || ''));
                if (jpOnly.length > 0) langFiltered = jpOnly;
              } else {
                const enOnly = sameNumVariants.filter((v: any) => !/JAPANESE|CHINESE/i.test(v.name || '') && !/JAPANESE|CHINESE/i.test(v.brand || ''));
                if (enOnly.length > 0) langFiltered = enOnly;
              }
              
              // Apply holo/reverse filter
              let pool = langFiltered;
              if (isReverse) {
                const rev = langFiltered.filter((v: any) => /REVERSE/i.test(v.name || ''));
                if (rev.length > 0) pool = rev;
              } else if (isHolo) {
                const hol = langFiltered.filter((v: any) => /HOLO/i.test(v.name || '') && !/REVERSE/i.test(v.name || ''));
                if (hol.length > 0) pool = hol;
              }
              
              // Pick variant with most sales for requested grade
              const gp = grade ? grade.split('-')[0]?.toUpperCase() : '';
              const gn = grade ? grade.split('-')[1] : '';
              if (gp && gn && pool.length > 1) {
                let bestV = pool[0], bestC = 0;
                for (const v of pool) {
                  const cnt = (v.grades || []).filter((g: any) => g.grader?.toUpperCase() === gp && String(g.grade) === gn).length;
                  if (cnt > bestC) { bestC = cnt; bestV = v; }
                }
                chosen = bestV;
              } else {
                chosen = pool[0];
              }
            } else {
              chosen = exactMatch;
            }
          }
        }

        // Get transaction count
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

        // Build chart URL — cert assetId > search assetId > name query
        const chartParams = new URLSearchParams();
        chartParams.set("endpoint", "chart");
        chartParams.set("q", searchQuery);
        if (nftAddress) chartParams.set("mint", nftAddress);
        if (certAssetId) {
          chartParams.set("assetId", certAssetId);
        } else if (chosen.assetId) {
          chartParams.set("assetId", chosen.assetId);
        }
        if (grade) chartParams.set("grade", grade);
        
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

  // Sealed / Phygital product pricing display
  if ((category === "SEALED" || source === 'phygitals') && sealedPrice) {
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

  if ((category === "SEALED" || source === 'phygitals') && !sealedPrice && !loading) return null;

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
