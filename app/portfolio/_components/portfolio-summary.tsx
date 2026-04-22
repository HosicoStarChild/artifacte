import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import {
  formatCompactUsd,
  formatSol,
  formatUsd,
  type PortfolioAccent,
  type PortfolioBreakdownItem,
  type PortfolioSummary as PortfolioSummaryData,
} from "@/lib/portfolio";
import { cn } from "@/lib/utils";

interface PortfolioSummaryProps {
  summary: PortfolioSummaryData;
  breakdown: PortfolioBreakdownItem[];
}

function getAccentClasses(accent: PortfolioAccent): { text: string; bar: string } {
  switch (accent) {
    case "gold":
      return {
        text: "text-gold-400",
        bar: "bg-linear-to-r from-gold-400 to-gold-600",
      };
    case "violet":
      return {
        text: "text-violet-300",
        bar: "bg-linear-to-r from-violet-400 to-purple-600",
      };
    case "blue":
      return {
        text: "text-blue-400",
        bar: "bg-linear-to-r from-blue-400 to-blue-600",
      };
    case "slate":
      return {
        text: "text-white/80",
        bar: "bg-linear-to-r from-white/40 to-white/70",
      };
  }
}

function formatBreakdownValue(item: PortfolioBreakdownItem): string {
  return item.currency === "SOL" ? formatSol(item.value) : formatCompactUsd(item.value);
}

export function PortfolioSummary({ summary, breakdown }: PortfolioSummaryProps) {
  const maxBreakdownValue = Math.max(...breakdown.map((item) => item.value), 1);

  return (
    <div className="space-y-8">
      <Card className="border-white/5 bg-dark-800/80 py-0">
        <CardContent className="px-6 py-6">
          <div className="grid gap-6 md:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)_auto_minmax(0,1fr)] md:items-center">
            <div className="text-center md:text-left">
              <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.24em] text-white/45">
                RWA Market Value
              </p>
              <h2 className="font-serif text-4xl font-bold text-gold-400 md:text-5xl">
                {formatUsd(summary.rwaMarketValueUsd)}
              </h2>
              <p className="mt-2 text-xs text-white/40">Powered by Artifacte Oracle</p>
            </div>

            {summary.digitalCollectiblesFloorValueSol > 0 ? (
              <Separator className="hidden bg-white/10 md:block" orientation="vertical" />
            ) : null}

            {summary.digitalCollectiblesFloorValueSol > 0 ? (
              <div className="text-center md:text-left">
                <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.24em] text-white/45">
                  Digital Collectibles
                </p>
                <h2 className="font-serif text-4xl font-bold text-blue-400 md:text-5xl">
                  {formatSol(summary.digitalCollectiblesFloorValueSol)}
                </h2>
                <p className="mt-2 text-xs text-white/40">Floor price via curated collection feeds</p>
              </div>
            ) : null}

            <Separator className="hidden bg-white/10 md:block" orientation="vertical" />

            <div className="text-center md:text-left">
              <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.24em] text-white/45">
                Insured Value
              </p>
              <h2 className="font-serif text-3xl font-bold text-white/70 md:text-4xl">
                {formatUsd(summary.insuredValueUsd)}
              </h2>
              <p className="mt-2 text-xs text-white/40">
                CC insured across {summary.collectorsCryptCardCount} cards
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-3">
        <Card className="border-white/5 bg-dark-800/80 py-0">
          <CardContent className="space-y-2 px-5 py-5">
            <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-white/45">RWAs</p>
            <p className="font-serif text-2xl font-bold text-gold-400">{summary.rwaCount}</p>
            <p className="text-xs text-white/40">Artifacte · CC · Phygitals</p>
          </CardContent>
        </Card>
        <Card className="border-white/5 bg-dark-800/80 py-0">
          <CardContent className="space-y-2 px-5 py-5">
            <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-white/45">Digital Collectibles</p>
            <p className="font-serif text-2xl font-bold text-blue-400">{summary.digitalCollectiblesCount}</p>
            <p className="text-xs text-white/40">In wallet</p>
          </CardContent>
        </Card>
        <Card className="border-white/5 bg-dark-800/80 py-0">
          <CardContent className="space-y-2 px-5 py-5">
            <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-white/45">Total Portfolio</p>
            <p className="font-serif text-2xl font-bold text-white">{summary.totalAssetCount}</p>
            <p className="text-xs text-white/40">RWAs + Digital Collectibles</p>
          </CardContent>
        </Card>
      </div>

      {breakdown.length ? (
        <Card className="border-white/5 bg-dark-800/80 py-0">
          <CardContent className="space-y-5 px-6 py-6">
            <div className="space-y-2">
              <h3 className="font-serif text-lg text-white">Portfolio Value by Category</h3>
              <p className="text-xs text-white/45">
                RWA values come from Artifacte Oracle and marketplace pricing. Digital collectibles use floor price data.
              </p>
            </div>
            <div className="space-y-4">
              {breakdown.map((item) => {
                const accent = getAccentClasses(item.accent);

                return (
                  <div key={item.id} className="space-y-2">
                    <div className="flex items-center justify-between gap-4">
                      <p className="text-sm text-white/80">{item.label}</p>
                      <p className={cn("text-xs font-semibold", accent.text)}>
                        {formatBreakdownValue(item)}
                      </p>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-dark-900">
                      <div
                        className={cn("h-full rounded-full", accent.bar)}
                        style={{ width: `${(item.value / maxBreakdownValue) * 100}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}