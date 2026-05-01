"use client";

import { useState, type SyntheticEvent } from "react";

import { resolveHomeImageSrc } from "@/lib/home-image";
import { cn } from "@/lib/utils";

type HomeImageProps = {
  src?: string;
  alt: string;
  sizes: string;
  priority?: boolean;
  contain?: boolean;
  className?: string;
  onError?: (event: SyntheticEvent<HTMLImageElement, Event>) => void;
};

export function HomeImage({
  src,
  alt,
  sizes,
  priority = false,
  contain = false,
  className,
  onError,
}: HomeImageProps) {
  const resolvedSrc = resolveHomeImageSrc(src);
  const [broken, setBroken] = useState(false);

  if (!resolvedSrc || broken) {
    return (
      <img
        src="/placeholder-card.svg"
        alt=""
        aria-hidden="true"
        className="absolute inset-0 h-full w-full object-contain"
      />
    );
  }

  function handleError(event: SyntheticEvent<HTMLImageElement, Event>) {
    setBroken(true);
    onError?.(event);
  }

  return (
    <img
      src={resolvedSrc}
      alt={alt}
      sizes={sizes}
      className={cn(
        "absolute inset-0 h-full w-full transition-transform duration-500",
        contain ? "object-contain" : "object-cover",
        className
      )}
      onError={handleError}
    />
  );
}