import { Skeleton } from "@/components/ui/skeleton";

export default function AuctionDetailLoading() {
  return (
    <main className="min-h-screen bg-dark-900 pt-24 pb-20">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        <Skeleton className="mb-6 h-5 w-44 bg-white/10" />

        <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
          <Skeleton className="aspect-square rounded-2xl bg-white/10 lg:col-span-1" />

          <div className="space-y-6 lg:col-span-2">
            <div className="space-y-3">
              <div className="flex gap-2">
                <Skeleton className="h-7 w-24 rounded-full bg-white/10" />
                <Skeleton className="h-7 w-20 rounded-full bg-white/10" />
              </div>
              <Skeleton className="h-5 w-40 bg-white/10" />
              <Skeleton className="h-12 w-full max-w-lg bg-white/10" />
              <Skeleton className="h-4 w-full max-w-sm bg-white/10" />
            </div>

            <Skeleton className="h-40 w-full rounded-2xl bg-white/10" />
            <div className="grid gap-4 md:grid-cols-2">
              <Skeleton className="h-28 rounded-2xl bg-white/10" />
              <Skeleton className="h-28 rounded-2xl bg-white/10" />
            </div>
            <Skeleton className="h-12 w-full rounded-xl bg-white/10" />
          </div>
        </div>
      </div>
    </main>
  );
}