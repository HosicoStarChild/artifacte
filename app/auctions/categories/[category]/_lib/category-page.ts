import type { Listing } from "@/lib/data";

export type CategoryRouteTab = "fixed" | "live";
export type CategoryCurrencyFilter = "All" | "USDC" | "SOL";
export type CategorySort = "default" | "price-high" | "price-low" | "newest";

const CATEGORY_FILTER_KEYS = [
  "search",
  "source",
  "tcg",
  "rarity",
  "grade",
  "language",
  "spiritType",
  "brand",
  "sport",
  "collection",
] as const;

export type CategoryFilterKey = (typeof CATEGORY_FILTER_KEYS)[number];
export type CategorySelectableFilterKey = Exclude<CategoryFilterKey, "search">;
export type CategoryFilters = Partial<Record<CategoryFilterKey, string>>;

export type CategoryMarketplaceListing = Listing & {
  mintAddress?: string;
};

export type CategoryFilterDefinition = {
  label: string;
  key: CategorySelectableFilterKey;
  options: readonly string[];
};

export type CategorySourceBadge = {
  label: string;
  className: string;
};

export type CategoryListingsApiResponse = {
  listings?: CategoryMarketplaceListing[];
  total?: number;
  error?: string;
  message?: string;
};

const PERSISTED_CURRENCY_FILTERS: readonly CategoryCurrencyFilter[] = ["All", "USDC", "SOL"];
const PERSISTED_SORTS: readonly CategorySort[] = ["default", "price-high", "price-low", "newest"];

export const ITEMS_PER_PAGE = 24;

export const CATEGORY_EMOJIS: Record<string, string> = {
  artifacte: "✨",
  "digital-art": "🎨",
  spirits: "🥃",
  "tcg-cards": "🃏",
  "sports-cards": "⚽",
  watches: "⌚",
  sealed: "📦",
  merchandise: "🛍️",
};

const REVERSE_TCG_CATEGORY_MAP: Record<string, string> = {
  Pokemon: "Pokemon",
  "One Piece": "One Piece",
  "Yu-Gi-Oh": "Yu-Gi-Oh",
  "Dragon Ball": "Dragon Ball Z",
  Lorcana: "Lorcana",
  Magic: "Magic",
  "Magic: The Gathering": "Magic",
};

const SERVER_TCG_CATEGORY_MAP: Record<string, string> = {
  pokemon: "Pokemon",
  "one piece": "One Piece",
  "yu-gi-oh": "Yu-Gi-Oh,Yu-Gi-Oh!",
  magic: "Magic: The Gathering",
  "dragon ball z": "Dragon Ball Z,Dragon Ball Super",
  lorcana: "Lorcana",
};

const SOURCE_FILTER_MAP: Record<string, string> = {
  "Collectors Crypt": "collector-crypt",
  Phygitals: "phygitals",
  Artifacte: "artifacte",
};

const CONTAIN_IMAGE_CATEGORIES = new Set(["TCG_CARDS", "SPORTS_CARDS", "SEALED", "MERCHANDISE", "SPIRITS", "WATCHES", "ARTIFACTE"]);

export const CATEGORY_FILTERS: Record<string, readonly CategoryFilterDefinition[]> = {
  TCG_CARDS: [
    { label: "Source", key: "source", options: ["All", "Collectors Crypt", "Phygitals", "Artifacte"] },
    { label: "TCG", key: "tcg", options: ["All", "One Piece", "Pokemon", "Dragon Ball Z", "Magic", "Yu-Gi-Oh"] },
    { label: "Rarity", key: "rarity", options: ["All", "Common", "Rare", "Ultra Rare", "Secret Rare", "Alt Art", "Manga Alt Art"] },
    { label: "Grade", key: "grade", options: ["All", "PSA 10", "PSA 9", "PSA 8", "BGS 9.5", "BGS 10", "CGC 10", "CGC 9.5", "CGC 9", "CGC 8", "Ungraded"] },
    { label: "Language", key: "language", options: ["All", "EN", "JPN"] },
  ],
  SPIRITS: [
    { label: "Type", key: "spiritType", options: ["All", "Bourbon", "Rye", "Single Malt Whisky", "Blended Whisky", "American Whiskey", "Rum", "Tequila", "Cognac", "Wine"] },
  ],
  WATCHES: [
    { label: "Brand", key: "brand", options: ["All", "Rolex", "Patek Philippe", "Audemars Piguet", "Omega", "Cartier", "Hublot", "Richard Mille"] },
  ],
  SPORTS_CARDS: [
    { label: "Sport", key: "sport", options: ["All", "Baseball", "Basketball", "Football", "Soccer"] },
    { label: "Grade", key: "grade", options: ["All", "PSA 10", "PSA 9", "BGS 9.5", "BGS 10", "SGC 10"] },
    { label: "Brand", key: "brand", options: ["All", "Topps", "Panini", "Upper Deck"] },
  ],
  DIGITAL_ART: [
    { label: "Collection", key: "collection", options: ["All", "SMB Gen 2", "SMB Gen 3", "Claynosaurz", "Galactic Gecko", "Famous Fox Federation", "Mad Lads", "Sensei"] },
  ],
  SEALED: [
    { label: "TCG", key: "tcg", options: ["All", "Pokemon", "One Piece", "Dragon Ball Z", "Magic", "Yu-Gi-Oh"] },
  ],
};

function isCategoryFilterKey(value: string): value is CategoryFilterKey {
  return CATEGORY_FILTER_KEYS.includes(value as CategoryFilterKey);
}

function isCategoryCurrencyFilter(value: string | null): value is CategoryCurrencyFilter {
  return value !== null && PERSISTED_CURRENCY_FILTERS.includes(value as CategoryCurrencyFilter);
}

function isCategorySort(value: string | null): value is CategorySort {
  return value !== null && PERSISTED_SORTS.includes(value as CategorySort);
}

export function normalizeCategoryCurrencyFilter(value: string | null): CategoryCurrencyFilter {
  return isCategoryCurrencyFilter(value) ? value : "All";
}

export function normalizeCategorySort(value: string | null): CategorySort {
  return isCategorySort(value) ? value : "default";
}

export function parseStoredCategoryFilters(serializedFilters: string | null): CategoryFilters {
  if (!serializedFilters) {
    return {};
  }

  try {
    const parsedFilters = JSON.parse(serializedFilters) as Partial<Record<CategoryFilterKey, string>>;
    const nextFilters: CategoryFilters = {};

    for (const [key, value] of Object.entries(parsedFilters)) {
      if (!isCategoryFilterKey(key) || typeof value !== "string" || value.length === 0) {
        continue;
      }

      nextFilters[key] = value;
    }

    return nextFilters;
  } catch {
    return {};
  }
}

export function normalizeStoredPage(value: string | null): number {
  const page = Number.parseInt(value ?? "1", 10);
  return Number.isFinite(page) && page > 0 ? page : 1;
}

export function mapCcCategoryToFilterValue(value: string): string {
  return REVERSE_TCG_CATEGORY_MAP[value] ?? value;
}

export function buildListingsQueryParams({
  category,
  currencyFilter,
  filters,
  isArtifacteCollection,
  page,
  sortBy,
}: {
  category: string;
  currencyFilter: CategoryCurrencyFilter;
  filters: CategoryFilters;
  isArtifacteCollection: boolean;
  page: number;
  sortBy: CategorySort;
}): URLSearchParams {
  const params = new URLSearchParams({
    ...(isArtifacteCollection ? {} : { category }),
    perPage: String(ITEMS_PER_PAGE),
    page: String(page),
    sort:
      sortBy === "newest"
        ? "newest"
        : sortBy === "price-high"
          ? "price-desc"
          : sortBy === "price-low"
            ? "price-asc"
            : "price-desc",
  });

  if (currencyFilter !== "All") {
    params.set("displayCurrency", currencyFilter);
  }

  const tcgFilter = filters.tcg;
  if (tcgFilter && tcgFilter !== "All") {
    const mappedTcgFilter = SERVER_TCG_CATEGORY_MAP[tcgFilter.toLowerCase()];
    if (mappedTcgFilter) {
      params.set("ccCategory", mappedTcgFilter);
    }
  }

  const forwardedFilterKeys = ["grade", "search", "rarity", "language", "sport", "brand", "spiritType"] as const;
  for (const key of forwardedFilterKeys) {
    const value = filters[key];
    if (!value || value === "All") {
      continue;
    }

    params.set(key === "search" ? "q" : key, value);
  }

  const sourceFilter = filters.source;
  if (sourceFilter && sourceFilter !== "All") {
    params.set("source", SOURCE_FILTER_MAP[sourceFilter] || sourceFilter);
  }

  return params;
}

export function getListingHref(listing: CategoryMarketplaceListing): string {
  if (listing.source === "collector-crypt") {
    return `/auctions/cards/${listing.id}`;
  }

  if (listing.source === "phygitals" && listing.nftAddress) {
    return `/auctions/cards/${listing.id}`;
  }

  if (listing.source === "artifacte" && listing.nftAddress) {
    return `/auctions/cards/${listing.nftAddress}`;
  }

  if (listing.externalUrl) {
    return listing.externalUrl;
  }

  return "#";
}

export function getListingSourceBadge(listing: CategoryMarketplaceListing): CategorySourceBadge | undefined {
  if (listing.source === "phygitals") {
    return {
      label: "PHYGITALS",
      className: "bg-violet-500/90 text-white",
    };
  }

  if (listing.source === "collector-crypt") {
    return {
      label: "COLLECTOR CRYPT",
      className: "bg-violet-500/90 text-white",
    };
  }

  if (listing.source === "artifacte") {
    return {
      label: "ARTIFACTE",
      className: "bg-gold-500/90 text-dark-900",
    };
  }

  return undefined;
}

export function getListingImageFit(listing: CategoryMarketplaceListing): "contain" | "cover" {
  return listing.source === "collector-crypt"
    || listing.source === "phygitals"
    || listing.source === "artifacte"
    || (typeof listing.category === "string" && CONTAIN_IMAGE_CATEGORIES.has(listing.category))
    ? "contain"
    : "cover";
}

export function getListingImageAspect(listing: CategoryMarketplaceListing): "square" | "portrait" {
  return listing.source === "collector-crypt" ? "portrait" : "square";
}

export function usesMarketplaceFeed(category: string | undefined): boolean {
  return category === "TCG_CARDS"
    || category === "SPORTS_CARDS"
    || category === "SEALED"
    || category === "MERCHANDISE"
    || category === "SPIRITS"
    || category === "ARTIFACTE";
}

export function showsCategoryCurrencyFilter(category: string | undefined): boolean {
  return category === "TCG_CARDS"
    || category === "SPORTS_CARDS"
    || category === "SEALED"
    || category === "MERCHANDISE";
}

export function getStaticCategoryCurrencyLabel(category: string | undefined): string {
  return category === "DIGITAL_ART" ? "SOL" : "USDC";
}

export async function readCategoryListingsApiResponse(response: Response): Promise<CategoryListingsApiResponse> {
  try {
    return (await response.json()) as CategoryListingsApiResponse;
  } catch {
    return {};
  }
}