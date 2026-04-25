import Image from "next/image";
import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { formatPortfolioValue, type PortfolioAccent, type PortfolioAssetCard as PortfolioAssetCardData } from "@/lib/portfolio";
import { cn } from "@/lib/utils";

interface PortfolioAssetCardProps {
  asset: PortfolioAssetCardData;
}

function getBadgeClasses(accent: PortfolioAccent): string {
  switch (accent) {
    case "gold":
      return "border-gold-500/40 bg-gold-500/15 text-gold-300";
    case "violet":
      return "border-violet-500/40 bg-violet-500/15 text-violet-200";
    case "blue":
      return "border-blue-500/40 bg-blue-500/15 text-blue-200";
    case "slate":
      return "border-white/10 bg-white/5 text-white/80";
  }
}

function getValueClasses(accent: PortfolioAccent): string {
  switch (accent) {
    case "gold":
      return "text-gold-400";
    case "violet":
      return "text-violet-300";
    case "blue":
      return "text-blue-400";
    case "slate":
      return "text-white";
  }
}

export function PortfolioAssetCard({ asset }: PortfolioAssetCardProps) {
  const imageClasses = asset.imageFit === "contain"
    ? "object-contain p-4"
    : "object-cover";
  const ratioClass = asset.aspectRatio === "portrait" ? "aspect-3/4" : "aspect-square";

  return (
    <Link href={asset.href} className="group block h-full">
      <Card className="h-full overflow-hidden border-white/5 bg-dark-800/85 py-0 transition duration-200 hover:border-white/15 hover:bg-dark-800">
        <div className={cn("relative overflow-hidden bg-dark-900", ratioClass)}>
          <Badge className={cn("absolute right-3 top-3 z-10 border text-[10px] font-semibold tracking-[0.18em] uppercase", getBadgeClasses(asset.badgeAccent))}>
            {asset.badgeLabel}
          </Badge>
          {asset.imageSrc ? (
            <img
              alt={asset.name}
              className={cn("transition duration-300 group-hover:scale-[1.02]", imageClasses)}
              sizes="(min-width: 1280px) 23vw, (min-width: 768px) 30vw, (min-width: 640px) 45vw, 100vw"
              src={asset.imageSrc}
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center bg-dark-800 text-3xl text-white/35">
              •
            </div>
          )}
        </div>
        <CardContent className="space-y-3 px-4 py-4">
          <div className="space-y-1">
            <h3 className="truncate text-sm font-medium text-white">{asset.name}</h3>
            {asset.supportingText ? (
              <p className="truncate text-[11px] text-white/55">{asset.supportingText}</p>
            ) : null}
            {asset.collectionLabel && asset.collectionLabel !== asset.supportingText ? (
              <p className="truncate text-[11px] text-white/45">{asset.collectionLabel}</p>
            ) : null}
          </div>
          <div className="space-y-1">
            <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-white/45">
              {asset.marketValueCurrency === "SOL" ? "Floor Price" : "Market Price"}
            </p>
            <p className={cn("font-serif text-lg font-bold", getValueClasses(asset.badgeAccent))}>
              {formatPortfolioValue(asset.marketValue, asset.marketValueCurrency)}
            </p>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}