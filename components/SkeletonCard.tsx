"use client";

export interface SkeletonCardProps {
  variant?: "auction" | "listing" | "compact";
  count?: number;
}

function SingleSkeletonCard({ variant = "auction" }: { variant: "auction" | "listing" | "compact" }) {
  if (variant === "compact") {
    return (
      <div className="bg-dark-800 rounded-lg border border-white/5 overflow-hidden p-4 animate-pulse">
        <div className="aspect-square bg-dark-700 rounded-lg mb-4" />
        <div className="space-y-2">
          <div className="h-4 bg-dark-700 rounded w-3/4" />
          <div className="h-3 bg-dark-700 rounded w-1/2" />
          <div className="h-8 bg-dark-700 rounded w-full mt-4" />
        </div>
      </div>
    );
  }

  return (
    <div className="bg-dark-800 rounded-lg border border-white/5 overflow-hidden card-hover flex flex-col h-full animate-pulse">
      {/* Image skeleton */}
      <div className="aspect-square bg-dark-700" />
      {/* Content skeleton */}
      <div className="p-6 flex-1 flex flex-col justify-between">
        <div>
          <div className="flex items-center justify-between gap-2 mb-3">
            <div className="h-4 bg-dark-700 rounded w-20" />
            <div className="h-4 bg-dark-700 rounded w-16" />
          </div>
          <div className="h-5 bg-dark-700 rounded mb-3 w-3/4" />
          <div className="h-4 bg-dark-700 rounded mb-2 w-2/3" />
          <div className="h-4 bg-dark-700 rounded w-1/2" />
        </div>
        <div className="space-y-3 mt-6">
          <div className="h-8 bg-dark-700 rounded w-full" />
          <div className="h-10 bg-dark-700 rounded w-full" />
        </div>
      </div>
    </div>
  );
}

export function SkeletonCard({ variant = "auction", count = 1 }: SkeletonCardProps) {
  if (count > 1) {
    const cols = variant === "compact" 
      ? "grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4" 
      : "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3";
    
    return (
      <div className={`grid ${cols} gap-8`}>
        {Array.from({ length: count }).map((_, i) => (
          <SingleSkeletonCard key={i} variant={variant} />
        ))}
      </div>
    );
  }

  return <SingleSkeletonCard variant={variant} />;
}
