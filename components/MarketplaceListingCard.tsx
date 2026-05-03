import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";

import VerifiedBadge from "@/components/VerifiedBadge";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { resolveHomeImageSrc } from "@/lib/home-image";
import { cn } from "@/lib/utils";

type MarketplaceListingCardBadge = {
  label: string;
  className: string;
};

type MarketplaceListingCardProps = {
  href: string;
  external?: boolean;
  imageSrc?: string;
  imageAlt: string;
  title: string;
  subtitle?: string | null;
  meta?: string | null;
  verifiedBy?: string;
  eyebrow?: string;
  priceLabel: string;
  currencyLabel?: string | null;
  sourceBadge?: MarketplaceListingCardBadge;
  action?: ReactNode;
  imageFit?: "contain" | "cover";
  imageAspect?: "square" | "portrait";
  imageLoading?: "lazy" | "eager";
  imageSizes?: string;
  className?: string;
};

export function MarketplaceListingCard({
  href,
  external = false,
  imageSrc,
  imageAlt,
  title,
  subtitle,
  meta,
  verifiedBy,
  eyebrow = "Fixed Price",
  priceLabel,
  currencyLabel,
  sourceBadge,
  action,
  imageFit = "cover",
  imageAspect = "square",
  imageLoading = "eager",
  imageSizes = "(max-width: 768px) 100vw, 288px",
  className,
}: MarketplaceListingCardProps) {
  const resolvedImageSrc = resolveHomeImageSrc(imageSrc) ?? "/placeholder-card.svg";

  const content = (
    <>
      <div
        className={cn(
          "relative overflow-hidden bg-dark-900",
          imageAspect === "portrait" ? "aspect-[3/4]" : "aspect-square"
        )}
      >
        <img
          src={resolvedImageSrc}
          alt={imageAlt}
          loading={imageLoading}
          sizes={imageSizes}
          className={cn(
            "absolute inset-0 h-full w-full transition-transform duration-500 group-hover:scale-105",
            imageFit === "contain" ? "object-contain p-2" : "object-cover"
          )}
        />
        {sourceBadge ? (
          <span
            className={cn(
              "absolute top-2 right-2 rounded-full px-2 py-0.5 text-[10px] font-bold",
              sourceBadge.className
            )}
          >
            {sourceBadge.label}
          </span>
        ) : null}
      </div>

      <div className="flex flex-1 flex-col justify-between p-5">
        <div>
          <div className="mb-2 flex items-start justify-between gap-2">
            <Badge className="rounded bg-transparent px-0 text-xs font-semibold tracking-widest uppercase text-gold-500 hover:bg-transparent">
              {eyebrow}
            </Badge>
            <VerifiedBadge collectionName={title} verifiedBy={verifiedBy} />
          </div>

          <h3 className="mb-1 line-clamp-2 text-sm font-medium text-white">{title}</h3>
          {subtitle ? <p className="mb-1 text-xs text-gray-500">{subtitle}</p> : null}
          {meta ? <p className="mb-4 text-xs text-gray-600">{meta}</p> : null}
        </div>

        <div>
          <p className="mb-1 text-xs font-medium tracking-wider text-gray-500">Price</p>
          <p className="font-serif text-xl text-white">{priceLabel}</p>
          {currencyLabel ? <p className="mt-1 text-xs text-gold-500">{currencyLabel}</p> : null}
        </div>
      </div>
    </>
  );

  return (
    <Card className={cn("h-full gap-0 overflow-hidden rounded-lg border border-white/5 bg-dark-800 py-0 text-white shadow-none", className)}>
      {external ? (
        <a href={href} target="_blank" rel="noopener noreferrer" className="group flex flex-1 flex-col">
          {content}
        </a>
      ) : (
        <Link href={href} className="group flex flex-1 flex-col">
          {content}
        </Link>
      )}

      {action ? <div className="px-5 pb-5">{action}</div> : null}
    </Card>
  );
}