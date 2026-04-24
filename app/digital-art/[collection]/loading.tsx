import { Skeleton } from "@/components/ui/skeleton";

export default function CollectionLoading() {
  return (
    <main className="min-h-screen bg-dark-900 pt-24 pb-20">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="space-y-8">
          <div className="flex flex-col gap-6 md:flex-row md:items-start">
            <Skeleton className="h-24 w-24 rounded-2xl bg-white/10" />
            <div className="flex-1 space-y-3">
              <Skeleton className="h-5 w-36 bg-white/10" />
              <Skeleton className="h-10 w-full max-w-sm bg-white/10" />
              <Skeleton className="h-5 w-full max-w-2xl bg-white/10" />
              <Skeleton className="h-5 w-full max-w-xl bg-white/10" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {Array.from({ length: 5 }).map((_, index) => (
              <Skeleton key={index} className="aspect-4/5 rounded-xl bg-white/8" />
            ))}
          </div>

          <Skeleton className="h-px w-full bg-white/10" />

          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {Array.from({ length: 10 }).map((_, index) => (
              <Skeleton key={index} className="aspect-4/5 rounded-xl bg-white/8" />
            ))}
          </div>
        </div>
      </div>
    </main>
  );
}