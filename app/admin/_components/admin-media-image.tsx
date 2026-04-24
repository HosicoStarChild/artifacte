import Image from "next/image"

import { resolveHomeImageSrc } from "@/lib/home-image"
import { cn } from "@/lib/utils"

const sizeClasses = {
  lg: "h-28 w-28",
  md: "h-20 w-20",
  sm: "h-14 w-14",
} as const

interface AdminMediaImageProps {
  alt: string
  className?: string
  size?: keyof typeof sizeClasses
  src?: string | null
}

export function AdminMediaImage({
  alt,
  className,
  size = "md",
  src,
}: AdminMediaImageProps) {
  const resolvedSrc = resolveHomeImageSrc(src ?? undefined)

  if (!resolvedSrc) {
    return (
      <div
        className={cn(
          "flex items-center justify-center rounded-lg border border-dashed border-border bg-muted/40 text-xs font-medium text-muted-foreground",
          sizeClasses[size],
          className
        )}
      >
        No image
      </div>
    )
  }

  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-lg border border-border/60 bg-muted/40",
        sizeClasses[size],
        className
      )}
    >
      <Image
        alt={alt}
        className="object-cover"
        fill
        sizes="(max-width: 768px) 96px, 128px"
        src={resolvedSrc}
        unoptimized={resolvedSrc.startsWith("http")}
      />
    </div>
  )
}