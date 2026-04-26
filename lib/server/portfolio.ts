import "server-only";

import { address } from "@solana/kit";
import { existsSync, readFileSync } from "fs";
import { join } from "path";

import {
  ARTIFACTE_AUTHORITY,
  COLLECTORS_CRYPT_COLLECTION,
  formatCompactUsd,
  formatSol,
  formatUsdWithCents,
  getPortfolioAssetHref,
  HeliusAsset,
  HeliusAssetMetadataAttribute,
  PORTFOLIO_IGNORED_ASSET_ID,
  PORTFOLIO_WHITELISTED_COLLECTIONS,
  PHYGITALS_COLLECTION,
  PortfolioAccent,
  PortfolioAssetCard,
  PortfolioBreakdownItem,
  PortfolioCollectorCryptCard,
  PortfolioCollectorCryptSnapshot,
  PortfolioPageData,
  PortfolioSection,
  PortfolioSectionId,
  resolvePortfolioImageSrc,
  type CollectorCryptResponse,
} from "@/lib/portfolio";
import { ensureHeliusRpcUrl, fetchHeliusRpc } from "@/app/api/_lib/list-route-utils";
import { resolveHeliusAssetImageSrc } from "@/lib/helius-asset-image";
import { getFloorPriceSnapshot, type FloorPriceSnapshot } from "@/lib/server/floor-prices";
import { getOracleApiUrl } from "@/lib/server/oracle-env";

interface OraclePortfolioMarketValue {
  marketValue?: number;
  source?: string;
}

interface OraclePortfolioMarketResponse {
  values?: Record<string, OraclePortfolioMarketValue>;
}

interface OracleCertResponse {
  value?: number | null;
}

interface OracleSearchResult {
  marketPrice?: number | null;
  price?: number | null;
}

interface OracleSearchResponse {
  results?: OracleSearchResult[];
}

interface TcgplayerPricePoint {
  marketPrice?: number | null;
  listedMedianPrice?: number | null;
  printingType?: string | null;
  condition?: string | null;
}

interface HeliusRpcResponse {
  result?: {
    items?: HeliusAsset[];
  };
  error?: {
    message?: string;
  };
}

interface PriceLookupCache {
  cert: Map<string, Promise<number>>;
  cgc: Map<string, Promise<number>>;
  search: Map<string, Promise<number>>;
  tcgplayer: Map<string, Promise<number>>;
}

interface RwaCandidate {
  asset: HeliusAsset;
  kind: Exclude<PortfolioSectionId, "digital-collectibles">;
  attributes: Map<string, string>;
  priceSource?: string;
  priceSourceId?: string;
  tcg: string;
}

interface ResolvedRwaAsset {
  kind: Exclude<PortfolioSectionId, "digital-collectibles">;
  item: PortfolioAssetCard;
}

const ORACLE_API = getOracleApiUrl();
const COLLECTOR_CRYPT_API = "https://api.collectorcrypt.com/marketplace";
const COLLECTOR_CRYPT_USER_AGENT = "Artifacte-Portfolio/2.0";
const PORTFOLIO_TIMEOUT_MS = 10_000;

const oracleLookup = loadOracleLookup();

function loadOracleLookup(): Record<string, string> {
  try {
    const lookupPath = join(process.cwd(), "data", "oracle-lookup.json");

    if (!existsSync(lookupPath)) {
      return {};
    }

    const content = readFileSync(lookupPath, "utf8");
    return JSON.parse(content) as Record<string, string>;
  } catch {
    return {};
  }
}

function createEmptyCollectorCryptSnapshot(wallet: string): PortfolioCollectorCryptSnapshot {
  return {
    ok: true,
    wallet,
    timestamp: Date.now(),
    totalCards: 0,
    totalInsuredValue: 0,
    cards: [],
    categoriesByValue: {},
    gradeDistribution: {},
    listedCards: 0,
    unlistedCards: 0,
    totalListedValue: 0,
    marketCategoriesByValue: {},
  };
}

function createPriceLookupCache(): PriceLookupCache {
  return {
    cert: new Map<string, Promise<number>>(),
    cgc: new Map<string, Promise<number>>(),
    search: new Map<string, Promise<number>>(),
    tcgplayer: new Map<string, Promise<number>>(),
  };
}

function getOrSetAsync<T>(
  cache: Map<string, Promise<T>>,
  key: string,
  loader: () => Promise<T>
): Promise<T> {
  const existing = cache.get(key);
  if (existing) {
    return existing;
  }

  const promise = loader();
  cache.set(key, promise);
  return promise;
}

function parseNumericValue(rawValue?: string): number {
  if (!rawValue) {
    return 0;
  }

  const normalized = rawValue.replace(/[^0-9.]/g, "");
  const value = Number.parseFloat(normalized);
  return Number.isFinite(value) ? value : 0;
}

function normalizeAttributeValue(value: HeliusAssetMetadataAttribute["value"]): string {
  if (typeof value === "string") {
    return value.trim();
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  return "";
}

function buildAttributeLookup(attributes?: HeliusAssetMetadataAttribute[]): Map<string, string> {
  const lookup = new Map<string, string>();

  for (const attribute of attributes ?? []) {
    if (!attribute.trait_type) {
      continue;
    }

    const normalizedValue = normalizeAttributeValue(attribute.value);
    if (!normalizedValue) {
      continue;
    }

    lookup.set(attribute.trait_type.toLowerCase(), normalizedValue);
  }

  return lookup;
}

function getAttributeValue(
  attributes: Map<string, string>,
  ...traitNames: string[]
): string | undefined {
  for (const traitName of traitNames) {
    const value = attributes.get(traitName.toLowerCase());
    if (value) {
      return value;
    }
  }

  return undefined;
}

function getAssetName(asset: HeliusAsset): string {
  return asset.content?.metadata?.name?.trim() || asset.name?.trim() || "Unknown";
}

function getAssetImageSrc(asset: HeliusAsset): string | null {
  return resolveHeliusAssetImageSrc(asset);
}

function hasMatchingAddress(asset: HeliusAsset, targetAddress: string): boolean {
  return (
    asset.authorities?.some((authority) => authority.address === targetAddress) ||
    asset.creators?.some((creator) => creator.address === targetAddress) ||
    false
  );
}

function getCollectionGroupValue(asset: HeliusAsset): string | undefined {
  return asset.grouping?.find((group) => group.group_key === "collection")?.group_value;
}

function getWhitelistedCollectionAddress(asset: HeliusAsset): string | undefined {
  const collectionAddress = getCollectionGroupValue(asset);
  if (collectionAddress && PORTFOLIO_WHITELISTED_COLLECTIONS.has(collectionAddress)) {
    return collectionAddress;
  }

  return asset.authorities?.find(
    (authority) => authority.address && PORTFOLIO_WHITELISTED_COLLECTIONS.has(authority.address)
  )?.address;
}

function inferGradingCompany(attributes: Map<string, string>): string {
  const explicitCompany = getAttributeValue(
    attributes,
    "Grading Company",
    "Grader"
  );

  if (explicitCompany) {
    return explicitCompany.toUpperCase();
  }

  const grade = getAttributeValue(attributes, "Grade");
  const match = grade?.match(/^(PSA|BGS|CGC|SGC)\s/i);
  return match?.[1]?.toUpperCase() ?? "";
}

function getRwaCardBadge(kind: Exclude<PortfolioSectionId, "digital-collectibles">): {
  label: string;
  accent: PortfolioAccent;
  aspectRatio: "square" | "portrait";
  imageFit: "cover" | "contain";
} {
  switch (kind) {
    case "artifacte-rwa":
      return {
        label: "ARTIFACTE",
        accent: "gold",
        aspectRatio: "square",
        imageFit: "cover",
      };
    case "phygitals-rwa":
      return {
        label: "PHYGITALS",
        accent: "violet",
        aspectRatio: "square",
        imageFit: "cover",
      };
    case "collectors-crypt-rwa":
      return {
        label: "COLLECTORS CRYPT",
        accent: "violet",
        aspectRatio: "portrait",
        imageFit: "contain",
      };
  }
}

function createCollectorCryptDisplayCard(card: PortfolioCollectorCryptCard): PortfolioAssetCard {
  const marketValue = card.oracleValue ?? card.insuredValueNum;
  const gradeLabel = [card.gradingCompany, card.grade].filter(Boolean).join(" ");

  return {
    id: card.nftAddress,
    href: getPortfolioAssetHref(card.nftAddress),
    name: card.itemName,
    imageSrc: resolvePortfolioImageSrc(card.frontImage),
    badgeLabel: "COLLECTORS CRYPT",
    badgeAccent: "violet",
    marketValue,
    marketValueCurrency: "USD",
    supportingText: gradeLabel || card.category || undefined,
    collectionLabel: card.category || undefined,
    aspectRatio: "portrait",
    imageFit: "contain",
    sectionId: "collectors-crypt-rwa",
  };
}

function createDigitalCollectibleCard(
  asset: HeliusAsset,
  floorPriceSnapshot: FloorPriceSnapshot
): PortfolioAssetCard | null {
  const matchedAddress = getWhitelistedCollectionAddress(asset);
  if (!matchedAddress) {
    return null;
  }

  const collection = floorPriceSnapshot.collections[matchedAddress];
  const floor = collection?.floor ?? floorPriceSnapshot.floors[matchedAddress] ?? 0;
  const collectionLabel = collection?.name ?? `${matchedAddress.slice(0, 8)}...`;

  return {
    id: asset.id,
    href: getPortfolioAssetHref(asset.id),
    name: getAssetName(asset),
    imageSrc: getAssetImageSrc(asset),
    badgeLabel: "DIGITAL",
    badgeAccent: "blue",
    marketValue: floor,
    marketValueCurrency: "SOL",
    collectionLabel,
    supportingText: collectionLabel,
    aspectRatio: "square",
    imageFit: "cover",
    sectionId: "digital-collectibles",
  };
}

function createRwaCandidate(asset: HeliusAsset): RwaCandidate | null {
  const collectionAddress = getCollectionGroupValue(asset);
  const attributes = buildAttributeLookup(asset.content?.metadata?.attributes);
  const tcg = getAttributeValue(attributes, "TCG", "Category") ?? "Other";
  const priceSource = getAttributeValue(attributes, "Price Source") ??
    (getAttributeValue(attributes, "TCGPlayer ID") ? "TCGplayer" : undefined);
  const priceSourceId =
    getAttributeValue(attributes, "Price Source ID") ??
    getAttributeValue(attributes, "TCGPlayer ID") ??
    getAttributeValue(attributes, "TCGplayer Product ID");

  if (collectionAddress === COLLECTORS_CRYPT_COLLECTION) {
    return {
      asset,
      kind: "collectors-crypt-rwa",
      attributes,
      priceSource,
      priceSourceId,
      tcg,
    };
  }

  if (collectionAddress === PHYGITALS_COLLECTION) {
    return {
      asset,
      kind: "phygitals-rwa",
      attributes,
      priceSource,
      priceSourceId,
      tcg,
    };
  }

  if (hasMatchingAddress(asset, ARTIFACTE_AUTHORITY)) {
    return {
      asset,
      kind: "artifacte-rwa",
      attributes,
      priceSource,
      priceSourceId,
      tcg,
    };
  }

  return null;
}

function createSection(
  id: PortfolioSectionId,
  title: string,
  description: string,
  accent: PortfolioAccent,
  items: PortfolioAssetCard[]
): PortfolioSection | null {
  if (!items.length) {
    return null;
  }

  return {
    id,
    title,
    description,
    accent,
    items,
  };
}

async function mapWithConcurrency<T, TResult>(
  values: readonly T[],
  concurrency: number,
  mapper: (value: T, index: number) => Promise<TResult>
): Promise<TResult[]> {
  const results = new Array<TResult>(values.length);
  let nextIndex = 0;

  async function worker(): Promise<void> {
    while (nextIndex < values.length) {
      const currentIndex = nextIndex;
      nextIndex += 1;
      results[currentIndex] = await mapper(values[currentIndex], currentIndex);
    }
  }

  const workerCount = Math.min(concurrency, values.length);
  await Promise.all(Array.from({ length: workerCount }, () => worker()));

  return results;
}

function sortPortfolioItems(items: PortfolioAssetCard[]): PortfolioAssetCard[] {
  return [...items].sort((left, right) => {
    if (right.marketValue !== left.marketValue) {
      return right.marketValue - left.marketValue;
    }

    return left.name.localeCompare(right.name);
  });
}

async function fetchCollectorCryptResponse(wallet: string): Promise<CollectorCryptResponse> {
  const response = await fetch(
    `${COLLECTOR_CRYPT_API}?ownerAddress=${encodeURIComponent(wallet)}`,
    {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": COLLECTOR_CRYPT_USER_AGENT,
      },
      cache: "no-store",
      signal: AbortSignal.timeout(PORTFOLIO_TIMEOUT_MS),
    }
  );

  if (!response.ok) {
    throw new Error(`Collector Crypt API error: ${response.status} ${response.statusText}`);
  }

  return (await response.json()) as CollectorCryptResponse;
}

async function fetchCollectorCryptMarketValueMap(
  cards: PortfolioCollectorCryptCard[]
): Promise<Record<string, { price: number; source: string }>> {
  if (!cards.length) {
    return {};
  }

  try {
    const nftAddresses = cards.map((card) => card.nftAddress).filter(Boolean);
    const cardNames = cards.map((card) => card.itemName || "");
    const response = await fetch(
      `${ORACLE_API}/api/market/portfolio?nfts=${nftAddresses.join(",")}&names=${encodeURIComponent(cardNames.join("||"))}`,
      {
        cache: "no-store",
        signal: AbortSignal.timeout(PORTFOLIO_TIMEOUT_MS),
      }
    );

    if (!response.ok) {
      return {};
    }

    const payload = (await response.json()) as OraclePortfolioMarketResponse;
    const values = payload.values ?? {};

    return Object.fromEntries(
      Object.entries(values)
        .filter(([, value]) => typeof value.marketValue === "number")
        .map(([nft, value]) => [
          nft,
          {
            price: value.marketValue ?? 0,
            source: value.source ?? "oracle",
          },
        ])
    );
  } catch {
    return {};
  }
}

async function buildCollectorCryptSnapshot(wallet: string): Promise<PortfolioCollectorCryptSnapshot> {
  const response = await fetchCollectorCryptResponse(wallet);

  const cards: PortfolioCollectorCryptCard[] = (response.filterNFtCard ?? []).map((card) => {
    const nameKey = card.itemName.toUpperCase().trim();
    const altAssetId = oracleLookup[nameKey];

    return {
      ...card,
      insuredValueNum: Number.parseFloat(card.insuredValue || "0") || 0,
      altAssetId,
      altResearchUrl: altAssetId ? `https://alt.xyz/itm/${altAssetId}/research` : undefined,
      oracleValue: null,
      oracleSource: null,
    };
  });

  const marketPriceMap = await fetchCollectorCryptMarketValueMap(cards);
  const enrichedCards = cards.map((card) => ({
    ...card,
    oracleValue: marketPriceMap[card.nftAddress]?.price ?? null,
    oracleSource: marketPriceMap[card.nftAddress]?.source ?? null,
  }));

  const totalInsuredValue = enrichedCards.reduce(
    (sum, card) => sum + card.insuredValueNum,
    0
  );

  const listedCards = enrichedCards.filter((card) => card.listing !== null).length;
  const marketCategoriesByValue: Record<string, number> = {};
  const categoriesByValue: Record<string, number> = {};
  const gradeDistribution: Record<string, number> = {};

  let totalMarketValue = 0;

  for (const card of enrichedCards) {
    const marketValue = card.oracleValue ?? card.insuredValueNum;
    const category = card.category || "Other";
    const gradeKey = `${card.gradingCompany}-${card.grade}`;

    totalMarketValue += marketValue;
    marketCategoriesByValue[category] = (marketCategoriesByValue[category] ?? 0) + marketValue;
    categoriesByValue[category] = (categoriesByValue[category] ?? 0) + card.insuredValueNum;
    gradeDistribution[gradeKey] = (gradeDistribution[gradeKey] ?? 0) + 1;
  }

  return {
    ok: true,
    wallet,
    timestamp: Date.now(),
    totalCards: enrichedCards.length,
    totalInsuredValue,
    cards: enrichedCards.sort((left, right) => right.insuredValueNum - left.insuredValueNum),
    categoriesByValue,
    gradeDistribution,
    listedCards,
    unlistedCards: enrichedCards.length - listedCards,
    totalListedValue: totalMarketValue,
    marketCategoriesByValue,
  };
}

async function fetchHeliusAssetsByOwner(wallet: string): Promise<HeliusAsset[]> {
  try {
    const rpcUrl = ensureHeliusRpcUrl();
    const payload = await fetchHeliusRpc<HeliusRpcResponse>(rpcUrl, {
      jsonrpc: "2.0",
      id: "portfolio-das",
      method: "getAssetsByOwner",
      params: {
        ownerAddress: wallet,
        page: 1,
        limit: 1000,
      },
    });

    return payload.result?.items ?? [];
  } catch {
    return [];
  }
}

async function fetchOracleCertPrice(cert: string): Promise<number> {
  try {
    const response = await fetch(`${ORACLE_API}/api/cert/${encodeURIComponent(cert)}`, {
      cache: "no-store",
      signal: AbortSignal.timeout(PORTFOLIO_TIMEOUT_MS),
    });

    if (!response.ok) {
      return 0;
    }

    const payload = (await response.json()) as OracleCertResponse;
    return typeof payload.value === "number" ? payload.value : 0;
  } catch {
    return 0;
  }
}

async function fetchOracleCgcPrice(cert: string, grade: string): Promise<number> {
  try {
    const response = await fetch(
      `${ORACLE_API}/api/cert/cgc/${encodeURIComponent(cert)}?grade=${encodeURIComponent(grade)}`,
      {
        cache: "no-store",
        signal: AbortSignal.timeout(PORTFOLIO_TIMEOUT_MS),
      }
    );

    if (!response.ok) {
      return 0;
    }

    const payload = (await response.json()) as OracleCertResponse;
    return typeof payload.value === "number" ? payload.value : 0;
  } catch {
    return 0;
  }
}

async function fetchTcgplayerPrice(productId: string): Promise<number> {
  try {
    const response = await fetch(
      `https://mpapi.tcgplayer.com/v2/product/${encodeURIComponent(productId)}/pricepoints`,
      {
        cache: "no-store",
        signal: AbortSignal.timeout(PORTFOLIO_TIMEOUT_MS),
      }
    );

    if (!response.ok) {
      return 0;
    }

    const payload = (await response.json()) as TcgplayerPricePoint[];
    const nearMintFoil = payload.find(
      (pricePoint) =>
        pricePoint.printingType === "Foil" && pricePoint.condition === "Near Mint"
    );
    const nearMintNormal = payload.find(
      (pricePoint) =>
        pricePoint.printingType === "Normal" && pricePoint.condition === "Near Mint"
    );
    const anyFoil = payload.find((pricePoint) => pricePoint.printingType === "Foil");
    const bestPricePoint = nearMintFoil ?? nearMintNormal ?? anyFoil ?? payload[0];

    return bestPricePoint?.marketPrice ?? bestPricePoint?.listedMedianPrice ?? 0;
  } catch {
    return 0;
  }
}

async function fetchOracleSearchPrice(query: string): Promise<number> {
  try {
    const response = await fetch(
      `${ORACLE_API}/api/live/search?q=${encodeURIComponent(query)}`,
      {
        cache: "no-store",
        signal: AbortSignal.timeout(PORTFOLIO_TIMEOUT_MS),
      }
    );

    if (!response.ok) {
      return 0;
    }

    const payload = (await response.json()) as OracleSearchResponse;
    const firstResult = payload.results?.[0];
    return firstResult?.marketPrice ?? firstResult?.price ?? 0;
  } catch {
    return 0;
  }
}

async function resolveRwaAssetPrice(
  candidate: RwaCandidate,
  caches: PriceLookupCache
): Promise<number> {
  const gradingId = getAttributeValue(candidate.attributes, "Grading ID", "Cert Number");
  const gradingCompany = inferGradingCompany(candidate.attributes);

  if (gradingId && (gradingCompany === "PSA" || gradingCompany === "BGS")) {
    const price = await getOrSetAsync(caches.cert, gradingId, () => fetchOracleCertPrice(gradingId));
    if (price > 0) {
      return price;
    }
  }

  if (gradingId && gradingCompany === "CGC") {
    const gradeValue = getAttributeValue(candidate.attributes, "Grade", "The Grade") ?? "";
    const gradeKey = `CGC-${gradeValue.replace(/[^0-9.]/g, "")}`;
    const cacheKey = `${gradingId}:${gradeKey}`;
    const price = await getOrSetAsync(caches.cgc, cacheKey, () => fetchOracleCgcPrice(gradingId, gradeKey));
    if (price > 0) {
      return price;
    }
  }

  if (candidate.kind === "collectors-crypt-rwa") {
    const insuredValue = parseNumericValue(getAttributeValue(candidate.attributes, "Insured Value"));
    if (insuredValue > 0) {
      return insuredValue;
    }
  }

  if (candidate.priceSource?.toLowerCase() === "tcgplayer" && candidate.priceSourceId) {
    const price = await getOrSetAsync(caches.tcgplayer, candidate.priceSourceId, () =>
      fetchTcgplayerPrice(candidate.priceSourceId as string)
    );

    if (price > 0) {
      return price;
    }
  }

  const searchTerm = getAssetName(candidate.asset) || candidate.asset.id;
  if (!searchTerm) {
    return 0;
  }

  return getOrSetAsync(caches.search, searchTerm, () => fetchOracleSearchPrice(searchTerm));
}

async function resolveRwaAsset(
  candidate: RwaCandidate,
  caches: PriceLookupCache
): Promise<ResolvedRwaAsset> {
  const marketValue = await resolveRwaAssetPrice(candidate, caches);
  const badge = getRwaCardBadge(candidate.kind);

  return {
    kind: candidate.kind,
    item: {
      id: candidate.asset.id,
      href: getPortfolioAssetHref(candidate.asset.id),
      name: getAssetName(candidate.asset),
      imageSrc: getAssetImageSrc(candidate.asset),
      badgeLabel: badge.label,
      badgeAccent: badge.accent,
      marketValue,
      marketValueCurrency: "USD",
      supportingText: candidate.tcg !== "Other" ? candidate.tcg : undefined,
      collectionLabel: undefined,
      aspectRatio: badge.aspectRatio,
      imageFit: badge.imageFit,
      sectionId: candidate.kind,
    },
  };
}

function sumMarketValues(items: PortfolioAssetCard[]): number {
  return items.reduce((sum, item) => sum + item.marketValue, 0);
}

export function validatePortfolioWallet(wallet: string): string {
  address(wallet);
  return wallet;
}

export async function getPortfolioPageData(wallet: string): Promise<PortfolioPageData> {
  const validatedWallet = validatePortfolioWallet(wallet);

  const [collectorCryptResult, floorPriceResult, heliusResult] = await Promise.allSettled([
    buildCollectorCryptSnapshot(validatedWallet),
    getFloorPriceSnapshot(),
    fetchHeliusAssetsByOwner(validatedWallet),
  ]);

  const collectorCryptSnapshot = collectorCryptResult.status === "fulfilled"
    ? collectorCryptResult.value
    : createEmptyCollectorCryptSnapshot(validatedWallet);
  const floorPriceSnapshot = floorPriceResult.status === "fulfilled"
    ? floorPriceResult.value
    : { floors: {}, collections: {}, timestamp: Date.now() };
  const heliusAssets = heliusResult.status === "fulfilled" ? heliusResult.value : [];

  if (
    collectorCryptResult.status === "rejected" &&
    heliusResult.status === "rejected"
  ) {
    throw new Error("Failed to load portfolio data from upstream services");
  }

  const digitalCollectibles: PortfolioAssetCard[] = [];
  const rwaCandidates: RwaCandidate[] = [];

  for (const asset of heliusAssets) {
    if (asset.id === PORTFOLIO_IGNORED_ASSET_ID) {
      continue;
    }

    const rwaCandidate = createRwaCandidate(asset);
    if (rwaCandidate) {
      rwaCandidates.push(rwaCandidate);
      continue;
    }

    const digitalCollectible = createDigitalCollectibleCard(asset, floorPriceSnapshot);
    if (digitalCollectible) {
      digitalCollectibles.push(digitalCollectible);
    }
  }

  const priceLookupCache = createPriceLookupCache();
  const resolvedRwaAssets = await mapWithConcurrency(
    rwaCandidates,
    6,
    (candidate) => resolveRwaAsset(candidate, priceLookupCache)
  );

  const collectorsCryptCards = sortPortfolioItems(
    collectorCryptSnapshot.cards.map(createCollectorCryptDisplayCard)
  );
  const collectorsCryptCardIds = new Set(collectorsCryptCards.map((item) => item.id));
  const extraCollectorsCryptCards = sortPortfolioItems(
    resolvedRwaAssets
      .filter((asset) => asset.kind === "collectors-crypt-rwa")
      .map((asset) => asset.item)
      .filter((item) => !collectorsCryptCardIds.has(item.id))
  );
  const artifacteCards = sortPortfolioItems(
    resolvedRwaAssets
      .filter((asset) => asset.kind === "artifacte-rwa")
      .map((asset) => asset.item)
  );
  const phygitalCards = sortPortfolioItems(
    resolvedRwaAssets
      .filter((asset) => asset.kind === "phygitals-rwa")
      .map((asset) => asset.item)
  );
  const digitalCollectibleCards = sortPortfolioItems(digitalCollectibles);
  const collectorsCryptSectionItems = sortPortfolioItems([
    ...collectorsCryptCards,
    ...extraCollectorsCryptCards,
  ]);

  const sections = [
    createSection(
      "artifacte-rwa",
      "Artifacte RWA",
      "Artifacte-minted RWAs priced from oracle and marketplace data.",
      "gold",
      artifacteCards
    ),
    createSection(
      "collectors-crypt-rwa",
      "Collectors Crypt RWA",
      "Vault-backed cards priced by the Artifacte oracle with insured-value fallback.",
      "violet",
      collectorsCryptSectionItems
    ),
    createSection(
      "phygitals-rwa",
      "Phygitals RWA",
      "Phygital RWAs enriched with cert, oracle, and TCGplayer pricing.",
      "violet",
      phygitalCards
    ),
    createSection(
      "digital-collectibles",
      "Digital Collectibles",
      "Curated digital collectibles valued at collection floor price.",
      "blue",
      digitalCollectibleCards
    ),
  ].filter((section): section is PortfolioSection => section !== null);

  const collectorsCryptMarketValue = sumMarketValues(collectorsCryptSectionItems);
  const artifacteMarketValue = sumMarketValues(artifacteCards);
  const phygitalsMarketValue = sumMarketValues(phygitalCards);
  const digitalCollectiblesFloorValue = sumMarketValues(digitalCollectibleCards);

  const breakdown: PortfolioBreakdownItem[] = [
    collectorsCryptMarketValue > 0
      ? {
          id: "collectors-crypt-rwa",
          label: "Collectors Crypt RWA",
          value: collectorsCryptMarketValue,
          currency: "USD",
          accent: "violet",
        }
      : null,
    artifacteMarketValue > 0
      ? {
          id: "artifacte-rwa",
          label: "Artifacte RWA",
          value: artifacteMarketValue,
          currency: "USD",
          accent: "gold",
        }
      : null,
    phygitalsMarketValue > 0
      ? {
          id: "phygitals-rwa",
          label: "Phygitals RWA",
          value: phygitalsMarketValue,
          currency: "USD",
          accent: "violet",
        }
      : null,
    digitalCollectiblesFloorValue > 0
      ? {
          id: "digital-collectibles",
          label: "Digital Collectibles",
          value: digitalCollectiblesFloorValue,
          currency: "SOL",
          accent: "blue",
        }
      : null,
  ].filter((item): item is PortfolioBreakdownItem => item !== null);

  return {
    ok: true,
    wallet: validatedWallet,
    timestamp: Date.now(),
    summary: {
      rwaMarketValueUsd:
        collectorsCryptMarketValue + artifacteMarketValue + phygitalsMarketValue,
      digitalCollectiblesFloorValueSol: digitalCollectiblesFloorValue,
      insuredValueUsd: collectorCryptSnapshot.totalInsuredValue,
      rwaCount: collectorsCryptSectionItems.length + artifacteCards.length + phygitalCards.length,
      digitalCollectiblesCount: digitalCollectibleCards.length,
      totalAssetCount:
        collectorsCryptSectionItems.length +
        artifacteCards.length +
        phygitalCards.length +
        digitalCollectibleCards.length,
      collectorsCryptCardCount: collectorsCryptSectionItems.length,
    },
    breakdown,
    sections,
  };
}

export function formatPortfolioItemValue(item: PortfolioAssetCard): string {
  return item.marketValueCurrency === "SOL"
    ? formatSol(item.marketValue)
    : item.marketValue >= 1000
      ? formatCompactUsd(item.marketValue)
      : formatUsdWithCents(item.marketValue);
}