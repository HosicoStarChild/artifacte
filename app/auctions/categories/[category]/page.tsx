import { Suspense } from "react";

import { CategoryRouteClient } from "./_components/category-route-client";

function CategoryAuctionsPageFallback() {
  return (
    <div className="pt-24 pb-20 min-h-screen">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center py-20">
        <p className="text-gray-400">Loading category...</p>
      </div>
    </div>
  );
}

export default function CategoryAuctionsPage() {
  return (
    <Suspense fallback={<CategoryAuctionsPageFallback />}>
      <CategoryRouteClient />
    </Suspense>
  );
}
