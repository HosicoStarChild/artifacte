"use client";

import { SearchIcon } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";

import {
  getStaticCategoryCurrencyLabel,
  showsCategoryCurrencyFilter,
  type CategoryCurrencyFilter,
  type CategoryFilters,
  type CategoryRouteTab,
  type CategorySelectableFilterKey,
  type CategorySort,
} from "../_lib/category-page";

type CategoryControlsProps = {
  category: string;
  categoryFilterDefinitions: readonly {
    label: string;
    key: CategorySelectableFilterKey;
    options: readonly string[];
  }[];
  currencyFilter: CategoryCurrencyFilter;
  filters: CategoryFilters;
  hasActiveFilters: boolean;
  searchInput: string;
  sortBy: CategorySort;
  tab: CategoryRouteTab;
  useMarketplaceListings: boolean;
  onClearFilters: () => void;
  onCurrencyFilterChange: (value: CategoryCurrencyFilter) => void;
  onFilterChange: (key: CategorySelectableFilterKey, value: string) => void;
  onSearchChange: (value: string) => void;
  onSortChange: (value: CategorySort) => void;
  onTabChange: (value: CategoryRouteTab) => void;
};

const SORT_OPTIONS: ReadonlyArray<{ label: string; value: CategorySort }> = [
  { label: "Default", value: "default" },
  { label: "Price: High to Low", value: "price-high" },
  { label: "Price: Low to High", value: "price-low" },
  { label: "Newest Listing", value: "newest" },
];

function getToggleButtonClassName(isActive: boolean): string {
  return isActive
    ? "border-gold-500/40 bg-gold-500 text-dark-900 hover:bg-gold-500/90"
    : "border-white/10 bg-dark-900/70 text-white/65 hover:bg-dark-900 hover:text-white";
}

export function CategoryControls({
  category,
  categoryFilterDefinitions,
  currencyFilter,
  filters,
  hasActiveFilters,
  searchInput,
  sortBy,
  tab,
  useMarketplaceListings,
  onClearFilters,
  onCurrencyFilterChange,
  onFilterChange,
  onSearchChange,
  onSortChange,
  onTabChange,
}: CategoryControlsProps) {
  const showCurrencyFilter = showsCategoryCurrencyFilter(category);
  const staticCurrencyLabel = getStaticCategoryCurrencyLabel(category);

  return (
    <Card className="border-white/5 bg-dark-800/70 py-0 shadow-[0_24px_70px_rgba(0,0,0,0.24)]">
      <CardContent className="space-y-6 px-4 py-5 sm:px-6 sm:py-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          {!useMarketplaceListings ? (
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => onTabChange("fixed")}
                className={getToggleButtonClassName(tab === "fixed")}
              >
                Fixed Price
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => onTabChange("live")}
                className={getToggleButtonClassName(tab === "live")}
              >
                Live Auctions
              </Button>
            </div>
          ) : (
            <div className="flex items-center gap-2 text-sm text-white/50">
              <Badge className="border-white/10 bg-white/5 text-white/75">Marketplace Feed</Badge>
              <span>Listings update from the active routing source.</span>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-3">
            <span className="text-xs font-medium tracking-[0.2em] uppercase text-white/40">Currency</span>

            {showCurrencyFilter ? (
              <div className="flex flex-wrap gap-2">
                {(["All", "USDC", "SOL"] as const).map((value) => (
                  <Button
                    key={value}
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => onCurrencyFilterChange(value)}
                    className={getToggleButtonClassName(currencyFilter === value)}
                  >
                    {value === "SOL" ? "◎ SOL" : value}
                  </Button>
                ))}
              </div>
            ) : (
              <Badge className="border-white/10 bg-dark-900/80 px-3 text-white/80">{staticCurrencyLabel}</Badge>
            )}
          </div>
        </div>

        <Separator className="bg-white/5" />

        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_220px]">
          <div className="relative">
            <SearchIcon className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-white/35" />
            <Input
              type="text"
              value={searchInput}
              onChange={(event) => onSearchChange(event.target.value)}
              placeholder="Search by name, set, number..."
              className="h-11 border-white/10 bg-dark-900/70 pl-10 text-white placeholder:text-white/35"
            />
          </div>

          <Select value={sortBy} onValueChange={(value) => value && onSortChange(value as CategorySort)}>
            <SelectTrigger className="h-11 w-full border-white/10 bg-dark-900/70 text-white" size="default">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="border border-white/10 bg-dark-800 text-white">
              {SORT_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {categoryFilterDefinitions.length > 0 ? (
          <div className="flex flex-wrap gap-3">
            {categoryFilterDefinitions.map((filterDefinition) => (
              <Select
                key={filterDefinition.key}
                value={filters[filterDefinition.key] || "All"}
                onValueChange={(value) => {
                  if (value) {
                    onFilterChange(filterDefinition.key, value);
                  }
                }}
              >
                <SelectTrigger className="h-10 min-w-44 border-white/10 bg-dark-900/70 text-white" size="default">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="border border-white/10 bg-dark-800 text-white">
                  {filterDefinition.options.map((option) => (
                    <SelectItem key={option} value={option}>
                      {option === "All" ? `${filterDefinition.label}: All` : option}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ))}

            {hasActiveFilters ? (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={onClearFilters}
                className="h-10 px-3 text-gold-300 hover:bg-gold-500/10 hover:text-gold-200"
              >
                Clear filters
              </Button>
            ) : null}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}