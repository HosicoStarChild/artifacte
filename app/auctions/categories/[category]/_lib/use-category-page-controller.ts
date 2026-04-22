"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";

import {
  auctions,
  categoryLabels,
  categorySlugMap,
  getListingPurchaseCurrency,
  listings as staticListings,
  resolveListingDisplayPrice,
} from "@/lib/data";
import { getExternalMarketplaceTotalPrice } from "@/lib/external-purchase-fees";

import {
  buildListingsQueryParams,
  CATEGORY_EMOJIS,
  CATEGORY_FILTERS,
  type CategoryCurrencyFilter,
  type CategoryFilters,
  type CategoryMarketplaceListing,
  normalizeCategoryCurrencyFilter,
  normalizeCategorySort,
  normalizeStoredPage,
  type CategoryRouteTab,
  readCategoryListingsApiResponse,
  mapCcCategoryToFilterValue,
  parseStoredCategoryFilters,
  type CategorySelectableFilterKey,
  type CategorySort,
  usesMarketplaceFeed,
  ITEMS_PER_PAGE,
} from "./category-page";

type CategoryPageController = {
  category: string | undefined;
  categoryFilterDefinitions: readonly {
    label: string;
    key: CategorySelectableFilterKey;
    options: readonly string[];
  }[];
  categoryName: string;
  categorySlug: string;
  currencyFilter: CategoryCurrencyFilter;
  emoji: string;
  filters: CategoryFilters;
  fixedListings: CategoryMarketplaceListing[];
  hasActiveFilters: boolean;
  hydrated: boolean;
  isDigitalArt: boolean;
  listingsLoading: boolean;
  listingsFilterLoading: boolean;
  liveAuctions: typeof auctions;
  page: number;
  searchInput: string;
  sortBy: CategorySort;
  tab: CategoryRouteTab;
  totalItems: number;
  totalPages: number;
  useMarketplaceListings: boolean;
  clearFilters: () => void;
  onCurrencyFilterChange: (value: CategoryCurrencyFilter) => void;
  onFilterChange: (key: CategorySelectableFilterKey, value: string) => void;
  onListingPurchased: (listingId: string, nftAddress?: string) => void;
  onPageChange: (nextPage: number) => void;
  onSearchChange: (value: string) => void;
  onSortChange: (value: CategorySort) => void;
  onTabChange: (nextTab: CategoryRouteTab) => void;
};

type CategoryPageInitialState = {
  currencyFilter: CategoryCurrencyFilter;
  filters: CategoryFilters;
  loaded: boolean;
  page: number;
  searchInput: string;
  sortBy: CategorySort;
};

type CategoryPageStateStore = {
  getSnapshot: () => CategoryPageInitialState;
  setState: (
    nextState:
      | CategoryPageInitialState
      | ((currentState: CategoryPageInitialState) => CategoryPageInitialState)
  ) => void;
  subscribe: (listener: () => void) => () => void;
};

function getDefaultControllerState(initialCcCategoryParam: string | null): CategoryPageInitialState {
  return {
    currencyFilter: "All",
    filters: initialCcCategoryParam
      ? { tcg: mapCcCategoryToFilterValue(initialCcCategoryParam) }
      : {},
    loaded: false,
    page: 1,
    searchInput: "",
    sortBy: "default",
  };
}

function createCategoryPageStateStore(initialState: CategoryPageInitialState): CategoryPageStateStore {
  let state = initialState;
  const listeners = new Set<() => void>();

  return {
    getSnapshot() {
      return state;
    },
    setState(nextState) {
      state = typeof nextState === "function" ? nextState(state) : nextState;
      listeners.forEach((listener) => listener());
    },
    subscribe(listener) {
      listeners.add(listener);

      return () => {
        listeners.delete(listener);
      };
    },
  };
}

function applyClientSideListingFilters(
  listings: CategoryMarketplaceListing[],
  filters: CategoryFilters,
  currencyFilter: CategoryCurrencyFilter,
  sortBy: CategorySort,
): CategoryMarketplaceListing[] {
  return listings
    .filter((listing) => {
      for (const [key, value] of Object.entries(filters)) {
        if (!value || value === "All") {
          continue;
        }

        if (key === "search") {
          const haystack = `${listing.name} ${listing.subtitle}`.toLowerCase();
          if (!haystack.includes(value.toLowerCase())) {
            return false;
          }
          continue;
        }

        if (key === "spiritType") {
          const spiritType = (listing.spirit_type || listing.subtitle || "").toLowerCase();
          if (!spiritType.includes(value.toLowerCase())) {
            return false;
          }
          continue;
        }

        if (key === "brand") {
          const searchableBrand = `${listing.name} ${listing.subtitle}`.toLowerCase();
          if (!searchableBrand.includes(value.toLowerCase())) {
            return false;
          }
          continue;
        }

        if (key === "collection") {
          const collectionText = (listing.subtitle || "").toLowerCase();
          if (!collectionText.includes(value.toLowerCase())) {
            return false;
          }
        }
      }

      return true;
    })
    .filter((listing) => {
      if (currencyFilter === "All") {
        return true;
      }

      const purchaseCurrency = getListingPurchaseCurrency(listing);
      return purchaseCurrency === currencyFilter;
    })
    .sort((left, right) => {
      const leftTotal = getExternalMarketplaceTotalPrice(resolveListingDisplayPrice(left).amount, {
        source: left.source,
      });
      const rightTotal = getExternalMarketplaceTotalPrice(resolveListingDisplayPrice(right).amount, {
        source: right.source,
      });

      if (sortBy === "price-high") {
        return rightTotal - leftTotal;
      }

      if (sortBy === "price-low") {
        return leftTotal - rightTotal;
      }

      if (sortBy === "newest") {
        if (left.id === right.id) {
          return 0;
        }

        return right.id > left.id ? 1 : -1;
      }

      return 0;
    });
}

function setFilterValue(
  currentFilters: CategoryFilters,
  key: CategorySelectableFilterKey | "search",
  value: string,
): CategoryFilters {
  const nextFilters = { ...currentFilters };

  if (!value || value === "All") {
    delete nextFilters[key];
    return nextFilters;
  }

  nextFilters[key] = value;
  return nextFilters;
}

function readInitialControllerState(
  storageKey: string,
  initialCcCategoryParam: string | null,
): CategoryPageInitialState {
  const storage = typeof window === "undefined" ? null : window.sessionStorage;
  const filters = initialCcCategoryParam
    ? { tcg: mapCcCategoryToFilterValue(initialCcCategoryParam) }
    : parseStoredCategoryFilters(storage?.getItem(storageKey) ?? null);
  const page = initialCcCategoryParam
    ? 1
    : normalizeStoredPage(storage?.getItem(`${storageKey}-page`) ?? null);

  return {
    currencyFilter: normalizeCategoryCurrencyFilter(storage?.getItem(`${storageKey}-currency`) ?? null),
    filters,
    loaded: true,
    page,
    searchInput: storage?.getItem(`${storageKey}-search`) ?? "",
    sortBy: normalizeCategorySort(storage?.getItem(`${storageKey}-sort`) ?? null),
  };
}

export function useCategoryPageController(
  categorySlug: string,
  initialCcCategoryParam: string | null,
): CategoryPageController {
  const category = categorySlugMap[categorySlug];
  const storageKey = `artifacte-filters-${categorySlug}`;
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const listingsRequestRef = useRef(0);
  const defaultState = getDefaultControllerState(initialCcCategoryParam);
  const [controllerStateStore] = useState(() => createCategoryPageStateStore(defaultState));
  const { currencyFilter, filters, loaded, page, searchInput, sortBy } = useSyncExternalStore(
    controllerStateStore.subscribe,
    controllerStateStore.getSnapshot,
    controllerStateStore.getSnapshot,
  );

  const [tab, setTab] = useState<CategoryRouteTab>("fixed");
  const [marketplaceListings, setMarketplaceListings] = useState<CategoryMarketplaceListing[]>([]);
  const [listingsLoading, setListingsLoading] = useState(true);
  const [listingsFilterLoading, setListingsFilterLoading] = useState(false);
  const [marketplaceTotal, setMarketplaceTotal] = useState(0);

  useEffect(() => {
    if (!loaded) {
      return;
    }

    sessionStorage.setItem(storageKey, JSON.stringify(filters));
    sessionStorage.setItem(`${storageKey}-page`, String(page));
    sessionStorage.setItem(`${storageKey}-currency`, currencyFilter);
    sessionStorage.setItem(`${storageKey}-sort`, sortBy);
    sessionStorage.setItem(`${storageKey}-search`, searchInput);
  }, [currencyFilter, filters, loaded, page, searchInput, sortBy, storageKey]);

  useEffect(() => {
    controllerStateStore.setState(readInitialControllerState(storageKey, initialCcCategoryParam));
  }, [controllerStateStore, initialCcCategoryParam, storageKey]);

  useEffect(() => {
    return () => {
      if (searchTimer.current) {
        clearTimeout(searchTimer.current);
      }
    };
  }, []);

  const isArtifacteCollection = category === "ARTIFACTE";
  const useMarketplaceListings = usesMarketplaceFeed(category);
  const isDigitalArt = category === "DIGITAL_ART";

  function beginListingsRefresh() {
    if (!useMarketplaceListings) {
      return;
    }

    if (marketplaceListings.length === 0) {
      setListingsLoading(true);
      return;
    }

    setListingsFilterLoading(true);
  }

  useEffect(() => {
    if (!useMarketplaceListings || !category) {
      return;
    }

    let cancelled = false;
    const abortController = new AbortController();
    const requestId = ++listingsRequestRef.current;
    const requestedPage = page;

    const params = buildListingsQueryParams({
      category,
      currencyFilter,
      filters,
      isArtifacteCollection,
      page,
      sortBy,
    });
    const apiUrl = isArtifacteCollection
      ? `/api/artifacte-program-listings?${params}`
      : `/api/me-listings?${params}`;

    fetch(apiUrl, { signal: abortController.signal })
      .then(async (response) => {
        const data = await readCategoryListingsApiResponse(response);
        if (!response.ok) {
          throw new Error(data.error || data.message || "Failed to fetch listings");
        }

        return data;
      })
      .then((data) => {
        if (cancelled || listingsRequestRef.current !== requestId) {
          return;
        }

        const total = Number(data.total) || 0;
        const totalPages = Math.max(1, Math.ceil(total / ITEMS_PER_PAGE));
        if (total > 0 && requestedPage > totalPages) {
          setMarketplaceTotal(total);
          setPage(totalPages);
          return;
        }

        setMarketplaceListings(Array.isArray(data.listings) ? data.listings : []);
        setMarketplaceTotal(total);
        setListingsLoading(false);
        setListingsFilterLoading(false);
      })
      .catch((error: Error) => {
        if (error.name === "AbortError") {
          return;
        }

        if (cancelled || listingsRequestRef.current !== requestId) {
          return;
        }

        setListingsLoading(false);
        setListingsFilterLoading(false);
      });

    return () => {
      cancelled = true;
      abortController.abort();
    };
  }, [
    category,
    currencyFilter,
    filters,
    isArtifacteCollection,
    page,
    sortBy,
    useMarketplaceListings,
  ]);

  const listings = useMarketplaceListings ? marketplaceListings : staticListings;
  const liveAuctions = category ? auctions.filter((auction) => auction.category === category) : [];
  const categoryListingsBase = category
    ? useMarketplaceListings
      ? marketplaceListings
      : listings.filter((listing) => listing.category === category)
    : [];

  const categoryListings = useMarketplaceListings
    ? categoryListingsBase
    : applyClientSideListingFilters(categoryListingsBase, filters, currencyFilter, sortBy);

  const totalItems = useMarketplaceListings ? marketplaceTotal : categoryListings.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / ITEMS_PER_PAGE));
  const fixedListings = useMarketplaceListings
    ? categoryListings
    : categoryListings.slice((page - 1) * ITEMS_PER_PAGE, page * ITEMS_PER_PAGE);

  const categoryName = category ? categoryLabels[category] || category : "Unknown Category";
  const emoji = CATEGORY_EMOJIS[categorySlug] || "🎯";
  const categoryFilterDefinitions = category ? CATEGORY_FILTERS[category] || [] : [];
  const hasActiveFilters = Object.values(filters).some((value) => Boolean(value && value !== "All"));

  function clearFilters() {
    beginListingsRefresh();
    controllerStateStore.setState((currentState) => ({
      ...currentState,
      filters: {},
      page: 1,
      searchInput: "",
    }));
  }

  function onCurrencyFilterChange(value: CategoryCurrencyFilter) {
    beginListingsRefresh();
    controllerStateStore.setState((currentState) => ({
      ...currentState,
      currencyFilter: value,
      page: 1,
    }));
  }

  function onFilterChange(key: CategorySelectableFilterKey, value: string) {
    beginListingsRefresh();
    controllerStateStore.setState((currentState) => ({
      ...currentState,
      filters: setFilterValue(currentState.filters, key, value),
      page: 1,
    }));
  }

  function onListingPurchased(listingId: string, nftAddress?: string) {
    setMarketplaceListings((currentListings) =>
      currentListings.filter(
        (listing) => listing.id !== listingId
          && listing.id !== nftAddress
          && listing.nftAddress !== nftAddress
          && listing.mintAddress !== nftAddress,
      ),
    );
  }

  function onPageChange(nextPage: number) {
    beginListingsRefresh();
    controllerStateStore.setState((currentState) => ({
      ...currentState,
      page: nextPage,
    }));
  }

  function onSearchChange(value: string) {
    controllerStateStore.setState((currentState) => ({
      ...currentState,
      searchInput: value,
    }));

    if (searchTimer.current) {
      clearTimeout(searchTimer.current);
    }

    searchTimer.current = setTimeout(() => {
      beginListingsRefresh();
      controllerStateStore.setState((currentState) => ({
        ...currentState,
        filters: setFilterValue(currentState.filters, "search", value),
        page: 1,
      }));
    }, 400);
  }

  function onSortChange(value: CategorySort) {
    beginListingsRefresh();
    controllerStateStore.setState((currentState) => ({
      ...currentState,
      page: 1,
      sortBy: value,
    }));
  }

  function onTabChange(nextTab: CategoryRouteTab) {
    setTab(nextTab);
  }

  return {
    category,
    categoryFilterDefinitions,
    categoryName,
    categorySlug,
    currencyFilter,
    emoji,
    filters,
    fixedListings,
    hasActiveFilters,
    hydrated: loaded,
    isDigitalArt,
    listingsFilterLoading,
    listingsLoading,
    liveAuctions,
    page,
    searchInput,
    sortBy,
    tab,
    totalItems,
    totalPages,
    useMarketplaceListings,
    clearFilters,
    onCurrencyFilterChange,
    onFilterChange,
    onListingPurchased,
    onPageChange,
    onSearchChange,
    onSortChange,
    onTabChange,
  };
}