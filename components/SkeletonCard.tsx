"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export interface SkeletonCardProps {
  variant?: "auction" | "listing" | "compact";
  count?: number;
}

function SingleSkeletonCard({ variant = "auction" }: { variant: "auction" | "listing" | "compact" }) {
  if (variant === "compact") {
    return (
      <Card className="overflow-hidden border border-white/5 bg-dark-800 py-0">
        <CardContent className="p-4">
          <Skeleton className="mb-4 aspect-square rounded-lg bg-dark-700" />
          <div className="space-y-2">
            <Skeleton className="h-4 w-3/4 bg-dark-700" />
            <Skeleton className="h-3 w-1/2 bg-dark-700" />
            <Skeleton className="mt-4 h-8 w-full bg-dark-700" />
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="card-hover flex h-full flex-col gap-0 overflow-hidden border border-white/5 bg-dark-800 py-0">
      <Skeleton className="aspect-square rounded-none bg-dark-700" />
      <CardContent className="flex flex-1 flex-col justify-between p-6">
        <div>
          <div className="flex items-center justify-between gap-2 mb-3">
            <Skeleton className="h-4 w-20 bg-dark-700" />
            <Skeleton className="h-4 w-16 bg-dark-700" />
          </div>
          <Skeleton className="mb-3 h-5 w-3/4 bg-dark-700" />
          <Skeleton className="mb-2 h-4 w-2/3 bg-dark-700" />
          <Skeleton className="h-4 w-1/2 bg-dark-700" />
        </div>
        <div className="space-y-3 mt-6">
          <Skeleton className="h-8 w-full bg-dark-700" />
          <Skeleton className="h-10 w-full bg-dark-700" />
        </div>
      </CardContent>
    </Card>
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
