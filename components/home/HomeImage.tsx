import type { SyntheticEvent } from "react";

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

  if (!resolvedSrc) {
    return <div className="absolute inset-0 bg-dark-900" aria-hidden="true" />;
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
      onError={onError}
    />
  );
}