import Image from "next/image";

import { resolveHomeImageSrc } from "@/lib/home-image";
import { cn } from "@/lib/utils";

type HomeImageProps = {
  src?: string;
  alt: string;
  sizes: string;
  priority?: boolean;
  contain?: boolean;
  className?: string;
};

export function HomeImage({
  src,
  alt,
  sizes,
  priority = false,
  contain = false,
  className,
}: HomeImageProps) {
  const resolvedSrc = resolveHomeImageSrc(src);

  if (!resolvedSrc) {
    return <div className="absolute inset-0 bg-dark-900" aria-hidden="true" />;
  }

  return (
    <Image
      src={resolvedSrc}
      alt={alt}
      fill
      priority={priority}
      sizes={sizes}
      className={cn(
        "absolute inset-0 h-full w-full transition-transform duration-500",
        contain ? "object-contain" : "object-cover",
        className
      )}
    />
  );
}