"use client";

import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";

import { Card, CardContent } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import { CategoryControls } from "./category-controls";
import { CategoryListingsSection } from "./category-listings-section";
import { CategoryPageHeader } from "./category-page-header";
import { useCategoryPageController } from "../_lib/use-category-page-controller";

type CategoryRouteContentProps = {
  categorySlug: string;
  initialCcCategoryParam: string | null;
};

function CategoryNotFoundState() {
  return (
    <main className="min-h-screen bg-dark-900 pt-24 pb-20">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <Card className="border-white/5 bg-dark-800/70 py-0">
          <CardContent className="space-y-4 px-6 py-14 text-center">
            <h1 className="font-serif text-3xl text-white">Category not found</h1>
            <p className="mx-auto max-w-lg text-sm leading-6 text-white/55">
              The category you requested does not exist or is no longer available.
            </p>
            <Link
              href="/"
              className={cn(
                buttonVariants({ size: "sm", variant: "ghost" }),
                "inline-flex px-0 text-gold-400 hover:bg-transparent hover:text-gold-300",
              )}
            >
              ← Back to Home
            </Link>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}

function CategoryRouteContent({ categorySlug, initialCcCategoryParam }: CategoryRouteContentProps) {
  const controller = useCategoryPageController(categorySlug, initialCcCategoryParam);

  if (!controller.category) {
    return <CategoryNotFoundState />;
  }

  return (
    <main className="min-h-screen bg-dark-900 pt-24 pb-20">
      <div className="mx-auto max-w-7xl space-y-10 px-4 sm:px-6 lg:px-8">
        <CategoryPageHeader categoryName={controller.categoryName} emoji={controller.emoji} />

        <CategoryControls
          category={controller.category}
          categoryFilterDefinitions={controller.categoryFilterDefinitions}
          currencyFilter={controller.currencyFilter}
          filters={controller.filters}
          hasActiveFilters={controller.hasActiveFilters}
          searchInput={controller.searchInput}
          sortBy={controller.sortBy}
          tab={controller.tab}
          useMarketplaceListings={controller.useMarketplaceListings}
          onClearFilters={controller.clearFilters}
          onCurrencyFilterChange={controller.onCurrencyFilterChange}
          onFilterChange={controller.onFilterChange}
          onSearchChange={controller.onSearchChange}
          onSortChange={controller.onSortChange}
          onTabChange={controller.onTabChange}
        />

        <CategoryListingsSection
          categoryName={controller.categoryName}
          fixedListings={controller.fixedListings}
          isDigitalArt={controller.isDigitalArt}
          liveAuctions={controller.liveAuctions}
          listingsFilterLoading={controller.listingsFilterLoading}
          listingsLoading={controller.listingsLoading}
          page={controller.page}
          tab={controller.tab}
          totalItems={controller.totalItems}
          totalPages={controller.totalPages}
          useMarketplaceListings={controller.useMarketplaceListings}
          onListingPurchased={controller.onListingPurchased}
          onPageChange={controller.onPageChange}
        />
      </div>
    </main>
  );
}

export function CategoryRouteClient() {
  const params = useParams<{ category: string }>();
  const searchParams = useSearchParams();
  const categorySlug = params.category;
  const initialCcCategoryParam = searchParams.get("ccCategory");

  return (
    <CategoryRouteContent
      key={`${categorySlug}:${initialCcCategoryParam ?? ""}`}
      categorySlug={categorySlug}
      initialCcCategoryParam={initialCcCategoryParam}
    />
  );
}