"use client";

import { useEffect, useState } from "react";
import {
  Area,
  Bar,
  CartesianGrid,
  ComposedChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

const CHART_OVERRIDES: Record<string, string> = {
  "2022 #001 Monkey D. Luffy PSA 10 One Piece Promos": "one piece luffy P-001 super prerelease winner",
  "2024 #019 Divine Departure PSA 10 One Piece Japanese OP10-Royal Blood": "OP10019 divine depature Japanese",
  "2023 #092 Rob Lucci PSA 10 One Piece Japanese OP05-Awakening of the New Era Pokemon": "OP05092 rob lucci japanese special alternate art",
};

type UngradedPrice = {
  lowestPrice: number;
  marketPrice: number;
  name: string;
  rarity: string;
};

type SealedPrice = {
  lowestPrice: number;
  marketPrice: number;
  name: string;
  tcg: string;
};

type ApiErrorPayload = {
  error?: string;
  message?: string;
};

type OracleSearchVariant = {
  fullName?: string;
  grade?: string | null;
  lowestPrice?: number | null;
  marketPrice?: number | null;
  name?: string;
  tcg?: string;
};

type OracleSearchResponse = {
  variants?: OracleSearchVariant[];
};

type OracleCertCard = {
  assetId?: string | null;
  assetName?: string | null;
  cardName?: string | null;
  cardNumber?: string | null;
  cardSet?: string | null;
};

type OracleCertResponse = {
  card?: OracleCertCard | null;
};

type OracleCgcCertResponse = {
  assetId?: string | null;
  card?: OracleCertCard | null;
  matchedName?: string | null;
};

type OracleAnalyticsPeriod = {
  averagePriceUsd: number | null;
  displayPriceUsd: number | null;
  hasAltValue: boolean;
  label: string;
  maxPriceUsd: number | null;
  minPriceUsd: number | null;
  periodStart: string;
  salesCount: number;
  salesVolumeUsd: number;
};

type OracleAnalyticsResponse = {
  altValueUsd: number | null;
  assetId: string | null;
  averageSalePriceUsd: number | null;
  cardName: string;
  coverageEnd: string | null;
  coverageStart: string | null;
  currentValueUsd: number | null;
  empty: boolean;
  gradeFilter: string | null;
  latestAveragePriceUsd: number | null;
  maxPriceUsd: number | null;
  minPriceUsd: number | null;
  periods: OracleAnalyticsPeriod[];
  title: string;
  totalObservedSales: number;
  totalSales: number;
  totalVolumeUsd: number;
};

type AnalyticsTooltipPayloadItem = {
  payload?: OracleAnalyticsPeriod;
};

interface PriceHistoryProps {
  altAssetName?: string;
  cardName?: string;
  category?: string;
  grade?: string;
  gradingCompany?: string;
  gradingId?: string;
  nftAddress?: string;
  priceSource?: string;
  priceSourceId?: string;
  source?: string;
  tcgPlayerId?: string;
  year?: number | string;
}

function buildSearchQuery(name: string): string {
  if (CHART_OVERRIDES[name]) return CHART_OVERRIDES[name];

  const opMatch = name.match(/#?((?:OP|ST|EB|PRB?)\d+-\d+)/i) || name.match(/#?((?:OP|ST|EB|PRB?)\d{5,})/i);
  if (opMatch) {
    let cardNum = opMatch[1];
    if (!cardNum.includes("-")) {
      const match = cardNum.match(/^([A-Z]+\d{2})(\d+)$/i);
      if (match) cardNum = `${match[1]}-${match[2]}`;
    }
    const variant = name.match(/\b(manga|alt(?:ernate)?\s*art|super\s*pre.?release|winner|sp|sec)\b/i);
    return variant ? `${cardNum} ${variant[0]}` : cardNum;
  }

  const pkMatch = name.match(/#?((?:SV|SM|XY|BW|DP|EX|SWSH|sv|S|s)\d*[-/]\d+[-/]?[A-Z]*)/i);
  if (pkMatch) return pkMatch[1];

  const hashMatch = name.match(/#(\d+(?:\/[\w-]+)?)/);
  if (hashMatch) {
    const setPrefix = name.match(/\b(OP|ST|EB|PRB?)\d{2}/i);
    if (setPrefix) {
      const cardNum = `${setPrefix[0]}-${hashMatch[1]}`;
      const variant = name.match(/\b(manga|alt(?:ernate)?\s*art|wanted|super\s*pre.?release|winner|sp|sec|3rd\s*anniversary|gold|serialized|tournament)\b/i);
      const charWords = name
        .replace(/\b\d{4}\b/g, "")
        .replace(/#\d+/g, "")
        .replace(/\b(PSA|CGC|BGS|SGC)\s*\d+\.?\d*/gi, "")
        .replace(/\b(GEM[- ]?MT|MINT|PRISTINE|English|EN)\b/gi, "")
        .replace(/\b(Pokemon|One Piece|Yu-Gi-Oh|Magic|Dragon Ball)\b/gi, "")
        .replace(/\b(OP|ST|EB)\d+[-\w]*/gi, "")
        .replace(/[\/|,-]/g, " ")
        .trim()
        .split(/\s+/)
        .filter((word) => word.length > 2 && /^[A-Z]/.test(word))
        .slice(0, 3);
      const parts = [cardNum, ...charWords];
      if (variant) parts.push(variant[0]);
      return parts.join(" ");
    }

    const parts: string[] = [];
    const cleanName = name
      .replace(/[\/|]/g, " ")
      .replace(/\b\d{4}\b/g, "")
      .replace(/#\d+/g, "")
      .replace(/\b(PSA|CGC|BGS|SGC)\s*\d+\.?\d*/gi, "")
      .replace(/\b(GEM[- ]?MT|MINT|PRISTINE)\b/gi, "")
      .replace(/\b(English|EN)\b/gi, "")
      .replace(/\b(Pokemon|One Piece|Yu-Gi-Oh|Magic|Dragon Ball)\b/gi, "")
      .replace(/\b(Promos?|Promo|FULL ART|SPECIAL BOX)\b/gi, "")
      .replace(/-HOLO\b/gi, "")
      .replace(/-/g, " ")
      .trim();
    const words = cleanName.split(/\s+/).filter((word) => word.length > 2 && /^[A-Z]/.test(word));
    if (words.length > 0) parts.push(...words.slice(0, 6));
    parts.push(hashMatch[1]);
    if (/one piece/i.test(name)) parts.push("one piece");
    else if (/pokemon/i.test(name)) parts.push("pokemon");
    else if (/dragon ball/i.test(name)) parts.push("dragon ball");
    else if (/yu-?gi-?oh/i.test(name)) parts.push("yugioh");
    return parts.join(" ");
  }

  let query = name
    .replace(/\b(PSA|CGC|BGS|SGC)\s*\d+\.?\d*/gi, "")
    .replace(/\b(GEM[- ]?MT|MINT|PRISTINE|NEAR MINT)\b/gi, "")
    .replace(/\b\d{4}\b/g, "")
    .replace(/\b(Pokemon|One Piece|Yu-Gi-Oh|Magic|Dragon Ball|Vibes|TCG)\b/gi, "")
    .replace(/\b(English|EN)\b/gi, "")
    .replace(/\b(1st Edition|Unlimited|Shadowless|Holo|Reverse)\b/gi, "")
    .replace(/\s+/g, " ")
    .trim();

  const words = query.split(" ").filter((word) => word.length > 2);
  if (words.length > 5) query = words.slice(0, 5).join(" ");

  return query || name.slice(0, 50);
}

function normalizeOptionalText(value?: string | null): string | undefined {
  const trimmedValue = value?.trim();
  return trimmedValue ? trimmedValue : undefined;
}

function getPreferredChartQuery(
  cardName: string,
  {
    altAssetName,
    certCardName,
  }: {
    altAssetName?: string;
    certCardName?: string | null;
  } = {},
): string {
  return normalizeOptionalText(altAssetName)
    ?? normalizeOptionalText(certCardName)
    ?? buildSearchQuery(cardName);
}

function normalizeGrade(value?: string): string | undefined {
  if (!value) return undefined;
  let normalized = value.trim()
    .replace(/^Beckett\s*/i, "BGS ")
    .replace(/^Professional Sports Authenticator\s*/i, "PSA ")
    .replace(/^Certified Guaranty Company\s*/i, "CGC ");
  normalized = normalized.replace(/^(PSA|BGS|CGC|SGC)\s+/i, (_, company) => `${company.toUpperCase()}-`);
  return normalized;
}

function formatUsd(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return "—";
  }

  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: value >= 1000 ? 0 : 2,
    maximumFractionDigits: value >= 1000 ? 0 : 2,
  }).format(value);
}

function formatCompactNumber(value: number): string {
  return new Intl.NumberFormat("en-US", {
    notation: value >= 1000 ? "compact" : "standard",
    maximumFractionDigits: value >= 1000 ? 1 : 0,
  }).format(value);
}

function formatCompactUsd(value: number | string): string {
  const numericValue = typeof value === "string" ? Number(value) : value;
  if (!Number.isFinite(numericValue)) {
    return "";
  }

  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    notation: Math.abs(numericValue) >= 1000 ? "compact" : "standard",
    maximumFractionDigits: Math.abs(numericValue) >= 1000 ? 1 : 0,
  }).format(numericValue);
}

function formatCoverage(start?: string | null, end?: string | null): string {
  if (!start || !end) {
    return "No history yet";
  }

  const formatter = new Intl.DateTimeFormat("en-US", { month: "short", year: "numeric" });
  return `${formatter.format(new Date(start))} - ${formatter.format(new Date(end))}`;
}

async function readApiError(response: Response, fallback: string): Promise<string> {
  try {
    const payload = (await response.json()) as ApiErrorPayload;
    return payload.error || payload.message || fallback;
  } catch {
    return fallback;
  }
}

function MetricCard({
  detail,
  label,
  value,
}: {
  detail?: string;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-2xl border border-white/5 bg-dark-900/80 px-4 py-4">
      <p className="text-[11px] uppercase tracking-[0.24em] text-gray-500">{label}</p>
      <p className="mt-2 font-serif text-2xl text-white">{value}</p>
      {detail ? <p className="mt-2 text-xs text-gray-500">{detail}</p> : null}
    </div>
  );
}

function AnalyticsTooltip({ active, payload }: { active?: boolean; payload?: AnalyticsTooltipPayloadItem[] }) {
  if (!active || !payload || payload.length === 0) {
    return null;
  }

  const point = payload.find((entry) => entry.payload)?.payload;
  if (!point) {
    return null;
  }

  const showCurrentValue = point.hasAltValue && point.displayPriceUsd !== point.averagePriceUsd;

  return (
    <div className="min-w-56 rounded-xl border border-white/10 bg-dark-900/95 px-4 py-3 shadow-2xl backdrop-blur-sm">
      <p className="text-sm font-medium text-white">{point.label}</p>
      <div className="mt-3 space-y-2 text-xs text-gray-300">
        <div className="flex items-center justify-between gap-4">
          <span className="text-gray-500">Avg sale price</span>
          <span className="text-white">{formatUsd(point.averagePriceUsd)}</span>
        </div>
        {showCurrentValue ? (
          <div className="flex items-center justify-between gap-4">
            <span className="text-gray-500">Current value</span>
            <span className="text-gold-400">{formatUsd(point.displayPriceUsd)}</span>
          </div>
        ) : null}
        <div className="flex items-center justify-between gap-4">
          <span className="text-gray-500">Sales volume</span>
          <span className="text-emerald-300">{formatUsd(point.salesVolumeUsd)}</span>
        </div>
        <div className="flex items-center justify-between gap-4">
          <span className="text-gray-500">Total sales</span>
          <span className="text-white">{formatCompactNumber(point.salesCount)}</span>
        </div>
      </div>
    </div>
  );
}

export default function PriceHistory({
  altAssetName,
  cardName,
  category,
  grade: rawGrade,
  gradingCompany,
  gradingId,
  nftAddress,
  priceSource,
  priceSourceId,
  source,
  tcgPlayerId,
}: PriceHistoryProps) {
  const grade = normalizeGrade(rawGrade);
  const [analytics, setAnalytics] = useState<OracleAnalyticsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [sealedPrice, setSealedPrice] = useState<SealedPrice | null>(null);
  const [ungradedPrice, setUngradedPrice] = useState<UngradedPrice | null>(null);

  const shouldShow = category === "TCG_CARDS" || category === "SPORTS_CARDS" || category === "WATCHES" || category === "SEALED";

  useEffect(() => {
    if (!shouldShow || !cardName) {
      setAnalytics(null);
      setSealedPrice(null);
      setUngradedPrice(null);
      return;
    }

    let cancelled = false;

    const fetchPriceHistory = async () => {
      setLoading(true);
      setError(null);
      setAnalytics(null);
      setSealedPrice(null);
      setUngradedPrice(null);

      try {
        const sourceId = priceSourceId || tcgPlayerId;

        if (source === "artifacte" && priceSource === "TCGplayer" && sourceId) {
          if (!cancelled) {
            setLoading(false);
          }
          return;
        }

        if (source === "phygitals" && !gradingId) {
          const cleanName = cardName
            .replace(/\b(Ungraded Card|POKEMON|phygitals?)\b/gi, "")
            .trim();

          const searchResponse = await fetch(
            `/api/oracle?endpoint=search&q=${encodeURIComponent(cleanName)}`,
            { signal: AbortSignal.timeout(10000) },
          );

          if (searchResponse.ok) {
            const searchData = (await searchResponse.json()) as OracleSearchResponse;
            if (searchData.variants && searchData.variants.length > 0) {
              const ungraded = searchData.variants.find(
                (variant) => !variant.grade || variant.grade === "Ungraded" || variant.grade === "Raw",
              ) || searchData.variants[0];

              if ((ungraded.marketPrice || ungraded.lowestPrice) && !cancelled) {
                setSealedPrice({
                  lowestPrice: ungraded.lowestPrice || 0,
                  marketPrice: ungraded.marketPrice || ungraded.lowestPrice || 0,
                  name: ungraded.fullName || ungraded.name || cleanName,
                  tcg: ungraded.tcg || "Pokemon",
                });
              } else if (!cancelled) {
                setError("No TCGplayer price data found");
              }
            } else if (!cancelled) {
              setError("No TCGplayer price data found");
            }
          } else if (!cancelled) {
            setError(await readApiError(searchResponse, "TCGplayer lookup failed"));
          }

          if (!cancelled) {
            setLoading(false);
          }
          return;
        }

        if (category === "SEALED") {
          const cleanName = cardName
            .replace(/\b(PSA|CGC|BGS)\s*\d+/gi, "")
            .replace(/\b\d{4}\b/g, "")
            .replace(/\b(Collector Crypt|collector_crypt)\b/gi, "")
            .trim();

          const sealedResponse = await fetch(
            `/api/oracle?endpoint=sealed&q=${encodeURIComponent(cleanName)}`,
            { signal: AbortSignal.timeout(10000) },
          );

          if (sealedResponse.ok) {
            const sealedData = (await sealedResponse.json()) as { results?: SealedPrice[] };
            const best = sealedData.results?.[0];
            if (best && !cancelled) {
              setSealedPrice(best);
            } else if (!cancelled) {
              setError("No sealed price data found");
            }
          } else if (!cancelled) {
            setError(await readApiError(sealedResponse, "Sealed price lookup failed"));
          }

          if (!cancelled) {
            setLoading(false);
          }
          return;
        }

        let certAssetId: string | null = null;
        let certCardName: string | null = null;

        if (gradingId) {
          try {
            if (gradingCompany === "PSA" || gradingCompany === "BGS") {
              const certResponse = await fetch(
                `/api/oracle?endpoint=cert&cert=${encodeURIComponent(gradingId)}`,
                { signal: AbortSignal.timeout(8000) },
              );
              if (certResponse.ok) {
                const certData = (await certResponse.json()) as OracleCertResponse;
                if (certData.card?.assetId) certAssetId = certData.card.assetId;
                if (certData.card?.assetName) certCardName = certData.card.assetName;
              }
            } else if (gradingCompany === "CGC") {
              const certResponse = await fetch(
                `/api/oracle?endpoint=cert-cgc&cert=${encodeURIComponent(gradingId)}&grade=${encodeURIComponent(grade || "")}`,
                { signal: AbortSignal.timeout(8000) },
              );
              if (certResponse.ok) {
                const certData = (await certResponse.json()) as OracleCgcCertResponse;
                if (certData.assetId) certAssetId = certData.assetId;
                if (certData.matchedName) {
                  certCardName = certData.matchedName;
                } else if (certData.card?.cardName) {
                  certCardName = [certData.card.cardName, certData.card.cardSet, certData.card.cardNumber].filter(Boolean).join(" ");
                }
              }
            }
          } catch {
            // Cert lookups are optional enhancements for chart matching.
          }
        }

        const analyticsParams = new URLSearchParams();
        analyticsParams.set("endpoint", "analytics");
        analyticsParams.set("q", getPreferredChartQuery(cardName, { altAssetName, certCardName }));
        if (category) analyticsParams.set("category", category);
        if (grade) analyticsParams.set("grade", grade);
        if (nftAddress) analyticsParams.set("mint", nftAddress);

        const analyticsAssetId = priceSource === "alt.xyz" && sourceId ? sourceId : certAssetId;
        if (analyticsAssetId) {
          analyticsParams.set("assetId", analyticsAssetId);
        }

        const analyticsResponse = await fetch(
          `/api/oracle?${analyticsParams.toString()}`,
          { signal: AbortSignal.timeout(15000) },
        );
        if (!analyticsResponse.ok) {
          throw new Error(await readApiError(analyticsResponse, "Unable to load price history"));
        }

        const analyticsData = (await analyticsResponse.json()) as OracleAnalyticsResponse;
        if (cancelled) {
          return;
        }

        setAnalytics(analyticsData);
        setLoading(false);

        const cardNumber = cardName.match(/#?((?:OP|ST|EB|PRB?)\d+-\d+)/i)?.[1]
          || cardName.match(/#?((?:SV|SM|XY|BW|DP|EX|SWSH)\d*[-/]\d+)/i)?.[1];

        if (!analyticsData.empty && cardNumber) {
          try {
            const ungradedParams = new URLSearchParams({
              endpoint: "ungraded",
              number: cardNumber,
              ccName: cardName,
            });
            const ungradedResponse = await fetch(
              `/api/oracle?${ungradedParams.toString()}`,
              { signal: AbortSignal.timeout(10000) },
            );
            if (ungradedResponse.ok) {
              const ungradedData = (await ungradedResponse.json()) as {
                found?: boolean;
                lowestPrice?: number;
                marketPrice?: number;
                name?: string;
                rarity?: string;
              };

              if (ungradedData.found && ungradedData.marketPrice && !cancelled) {
                setUngradedPrice({
                  lowestPrice: ungradedData.lowestPrice || 0,
                  marketPrice: ungradedData.marketPrice,
                  name: ungradedData.name || cardName,
                  rarity: ungradedData.rarity || "",
                });
              }
            }
          } catch {
            // Ungraded price is secondary data only.
          }
        }
      } catch (fetchError) {
        if (cancelled) {
          return;
        }

        console.error("Price history error:", fetchError);
        const message = fetchError instanceof Error ? fetchError.message : "Unable to load price data";
        setAnalytics(null);
        setError(message);
        setLoading(false);
      }
    };

    void fetchPriceHistory();

    return () => {
      cancelled = true;
    };
  }, [
    altAssetName,
    cardName,
    category,
    grade,
    gradingCompany,
    gradingId,
    nftAddress,
    priceSource,
    priceSourceId,
    shouldShow,
    source,
    tcgPlayerId,
  ]);

  if (!shouldShow) return null;

  if (loading) {
    return (
      <div className="mb-8 rounded-lg border border-white/10 bg-dark-800 p-8">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="font-serif text-xl text-white">Price History</h2>
            <div className="mt-2 h-4 w-56 animate-pulse rounded bg-dark-900" />
          </div>
          <span className="text-xs font-medium text-gray-500">Powered by Artifacte Oracle</span>
        </div>
        <div className="mt-6 grid gap-3 md:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="rounded-2xl border border-white/5 bg-dark-900/80 px-4 py-4">
              <div className="h-3 w-20 animate-pulse rounded bg-dark-700" />
              <div className="mt-3 h-8 w-24 animate-pulse rounded bg-dark-700" />
              <div className="mt-3 h-3 w-28 animate-pulse rounded bg-dark-700" />
            </div>
          ))}
        </div>
        <div className="mt-6 h-[340px] animate-pulse rounded-2xl border border-white/5 bg-dark-900" />
      </div>
    );
  }

  if ((category === "SEALED" || source === "phygitals") && sealedPrice) {
    return (
      <div className="mb-8 rounded-lg border border-white/10 bg-dark-800 p-8">
        <div className="mb-6 flex items-center justify-between gap-4">
          <h2 className="font-serif text-xl text-white">Market Price</h2>
          <span className="text-xs font-medium text-gray-500">Powered by Artifacte Oracle</span>
        </div>
        <div className="rounded-lg border border-white/5 bg-dark-900 p-5">
          <div className="mb-3 flex items-center justify-between">
            <span className="text-sm text-gray-400">TCGplayer Market Price</span>
            <span className="text-2xl font-semibold text-white">{formatUsd(sealedPrice.marketPrice)}</span>
          </div>
          {sealedPrice.lowestPrice ? (
            <div className="mb-3 flex items-center justify-between">
              <span className="text-sm text-gray-500">Lowest Listed</span>
              <span className="text-gray-300">{formatUsd(sealedPrice.lowestPrice)}</span>
            </div>
          ) : null}
          <div className="border-t border-white/5 pt-3">
            <p className="text-xs text-gray-600">{sealedPrice.name} • {sealedPrice.tcg}</p>
          </div>
        </div>
      </div>
    );
  }

  if (category === "SEALED" && !sealedPrice && !loading) return null;
  if (source === "phygitals" && !sealedPrice && !loading && !analytics && !error && !gradingId) return null;

  if (error && !analytics && !sealedPrice) {
    return (
      <div className="mb-8 rounded-lg border border-white/10 bg-dark-800 p-8">
        <h2 className="mb-4 font-serif text-xl text-white">Price History</h2>
        <div className="rounded-2xl border border-white/5 bg-dark-900 p-6 text-center text-sm text-gray-400">
          <p>Price data unavailable</p>
          <p className="mt-2 text-xs text-gray-500">{error}</p>
        </div>
      </div>
    );
  }

  if (!analytics) return null;

  if (analytics.empty || analytics.periods.length === 0) {
    return (
      <div className="mb-8 rounded-lg border border-white/10 bg-dark-800 p-8">
        <div className="mb-6 flex items-center justify-between gap-4">
          <div>
            <h2 className="font-serif text-xl text-white">Price History</h2>
            <p className="mt-1 text-sm text-gray-400">{analytics.cardName}</p>
          </div>
          <span className="text-xs font-medium text-gray-500">Powered by Artifacte Oracle</span>
        </div>
        <div className="rounded-3xl border border-white/5 bg-[radial-gradient(circle_at_top,_rgba(212,175,55,0.12),_rgba(10,10,10,0.85)_55%)] p-8">
          <p className="text-[11px] uppercase tracking-[0.28em] text-gold-500/70">No recorded sales yet</p>
          <h3 className="mt-3 font-serif text-3xl text-white">{analytics.cardName}</h3>
          <p className="mt-4 max-w-2xl text-sm leading-6 text-gray-400">
            This card resolved successfully, but the oracle has not tracked completed sales for it yet. The chart will appear automatically once historical sales are available.
          </p>
        </div>
      </div>
    );
  }

  const priceMetricLabel = analytics.altValueUsd !== null ? "Current value" : "Latest avg";
  const priceMetricDetail = analytics.altValueUsd !== null ? "Latest oracle value" : "Latest monthly average";

  return (
    <div className="mb-8 rounded-lg border border-white/10 bg-dark-800 p-8">
      <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div>
          <h2 className="font-serif text-xl text-white">Price History</h2>
          <p className="mt-2 text-lg text-gray-100">{analytics.cardName}</p>
          {analytics.gradeFilter ? (
            <p className="mt-2 text-xs uppercase tracking-[0.24em] text-gray-500">Filtered to {analytics.gradeFilter}</p>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-4 text-xs text-gray-500">
          <span className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full bg-gold-500" />
            Price history
          </span>
          <span className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-sm bg-emerald-500/80" />
            Sales volume
          </span>
          <span className="font-medium">Powered by Artifacte Oracle</span>
        </div>
      </div>

      <div className="mb-6 grid gap-3 md:grid-cols-4">
        <MetricCard
          label="Total sales"
          value={formatCompactNumber(analytics.totalSales)}
          detail={analytics.totalObservedSales !== analytics.totalSales ? `${formatCompactNumber(analytics.totalObservedSales)} observed before filters` : "Tracked completed sales"}
        />
        <MetricCard
          label="Sales volume"
          value={formatUsd(analytics.totalVolumeUsd)}
          detail={analytics.averageSalePriceUsd !== null ? `${formatUsd(analytics.averageSalePriceUsd)} average sale` : "No average yet"}
        />
        <MetricCard
          label={priceMetricLabel}
          value={formatUsd(analytics.currentValueUsd)}
          detail={priceMetricDetail}
        />
        <MetricCard
          label="Coverage"
          value={formatCoverage(analytics.coverageStart, analytics.coverageEnd)}
          detail={`${formatCompactNumber(analytics.periods.length)} monthly points`}
        />
      </div>

      <div className="rounded-3xl border border-white/5 bg-dark-900/80 p-4 sm:p-6">
        <div className="h-[340px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={analytics.periods} margin={{ top: 8, right: 16, left: 0, bottom: 8 }}>
              <defs>
                <linearGradient id="priceHistoryGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#d4af37" stopOpacity={0.34} />
                  <stop offset="100%" stopColor="#d4af37" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="rgba(255,255,255,0.06)" strokeDasharray="3 3" vertical={false} />
              <XAxis
                axisLine={false}
                dataKey="label"
                minTickGap={20}
                tick={{ fill: "#8a8f98", fontSize: 12 }}
                tickLine={false}
              />
              <YAxis
                axisLine={false}
                tick={{ fill: "#d4af37", fontSize: 12 }}
                tickFormatter={formatCompactUsd}
                tickLine={false}
                width={68}
                yAxisId="price"
              />
              <YAxis
                axisLine={false}
                orientation="right"
                tick={{ fill: "#5ac58a", fontSize: 12 }}
                tickFormatter={formatCompactUsd}
                tickLine={false}
                width={76}
                yAxisId="volume"
              />
              <Tooltip content={<AnalyticsTooltip />} cursor={{ fill: "rgba(255,255,255,0.03)" }} />
              <Bar
                dataKey="salesVolumeUsd"
                fill="rgba(72, 187, 120, 0.55)"
                maxBarSize={36}
                radius={[10, 10, 0, 0]}
                yAxisId="volume"
              />
              <Area
                activeDot={{ fill: "#d4af37", r: 4, stroke: "#111", strokeWidth: 1.5 }}
                dataKey="displayPriceUsd"
                fill="url(#priceHistoryGradient)"
                stroke="#d4af37"
                strokeWidth={2.5}
                type="monotone"
                yAxisId="price"
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </div>

      {ungradedPrice ? (
        <div className="mt-4 flex flex-col gap-3 rounded-2xl border border-white/5 bg-dark-900 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm text-gray-400">NM Ungraded</p>
            <p className="mt-1 text-xs text-gray-600">{ungradedPrice.name}</p>
          </div>
          <div className="text-left sm:text-right">
            <p className="text-lg font-medium text-white">{formatUsd(ungradedPrice.marketPrice)}</p>
            <p className="text-xs text-gray-500">Current market price</p>
          </div>
        </div>
      ) : null}
    </div>
  );
}