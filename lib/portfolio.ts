import { resolveHomeImageSrc } from "@/lib/home-image";

export interface PortfolioListing {
  price: number;
  currency: string;
  marketplace: string;
}

export interface CollectorCryptCard {
  itemName: string;
  grade: string;
  gradeNum: number;
  gradingCompany: string;
  insuredValue: string;
  nftAddress: string;
  frontImage: string;
  category: string;
  vault: string;
  year: number;
  set: string;
  listing: PortfolioListing | null;
}

export interface CollectorCryptResponse {
  findTotal: number;
  cardsQtyByCategory: Record<string, number>;
  filterNFtCard: CollectorCryptCard[];
}

export interface PortfolioCollectorCryptCard extends CollectorCryptCard {
  insuredValueNum: number;
  altAssetId?: string;
  altResearchUrl?: string;
  oracleValue: number | null;
  oracleSource: string | null;
}

export interface PortfolioCollectorCryptSnapshot {
  ok: true;
  wallet: string;
  timestamp: number;
  totalCards: number;
  totalInsuredValue: number;
  cards: PortfolioCollectorCryptCard[];
  categoriesByValue: Record<string, number>;
  gradeDistribution: Record<string, number>;
  listedCards: number;
  unlistedCards: number;
  totalListedValue: number;
  marketCategoriesByValue: Record<string, number>;
}

export interface PortfolioErrorResponse {
  ok: false;
  error: string;
}

export type PortfolioValueCurrency = "USD" | "SOL";
export type PortfolioAccent = "gold" | "violet" | "blue" | "slate";
export type PortfolioSectionId =
  | "artifacte-rwa"
  | "collectors-crypt-rwa"
  | "phygitals-rwa"
  | "digital-collectibles";

export interface PortfolioSummary {
  rwaMarketValueUsd: number;
  digitalCollectiblesFloorValueSol: number;
  insuredValueUsd: number;
  rwaCount: number;
  digitalCollectiblesCount: number;
  totalAssetCount: number;
  collectorsCryptCardCount: number;
}

export interface PortfolioBreakdownItem {
  id: PortfolioSectionId;
  label: string;
  value: number;
  currency: PortfolioValueCurrency;
  accent: PortfolioAccent;
}

export interface PortfolioAssetCard {
  id: string;
  href: string;
  name: string;
  imageSrc: string | null;
  badgeLabel: string;
  badgeAccent: PortfolioAccent;
  marketValue: number;
  marketValueCurrency: PortfolioValueCurrency;
  supportingText?: string;
  collectionLabel?: string;
  aspectRatio: "square" | "portrait";
  imageFit: "cover" | "contain";
  sectionId: PortfolioSectionId;
}

export interface PortfolioSection {
  id: PortfolioSectionId;
  title: string;
  description: string;
  accent: PortfolioAccent;
  items: PortfolioAssetCard[];
}

export interface PortfolioPageData {
  ok: true;
  wallet: string;
  timestamp: number;
  summary: PortfolioSummary;
  breakdown: PortfolioBreakdownItem[];
  sections: PortfolioSection[];
}

export type PortfolioApiResponse = PortfolioPageData | PortfolioErrorResponse;

export interface HeliusAssetMetadataAttribute {
  trait_type?: string;
  value?: string | number | boolean | null;
}

export interface HeliusAssetMetadata {
  name?: string;
  attributes?: HeliusAssetMetadataAttribute[];
}

export interface HeliusAssetFile {
  uri?: string;
  cdn_uri?: string;
  mime?: string;
}

export interface HeliusAssetContent {
  metadata?: HeliusAssetMetadata;
  links?: {
    image?: string;
  };
  files?: HeliusAssetFile[];
}

export interface HeliusAssetGrouping {
  group_key?: string;
  group_value?: string;
}

export interface HeliusAssetAuthority {
  address?: string;
}

export interface HeliusAssetCreator {
  address?: string;
}

export interface HeliusAsset {
  id: string;
  content?: HeliusAssetContent;
  grouping?: HeliusAssetGrouping[];
  authorities?: HeliusAssetAuthority[];
  creators?: HeliusAssetCreator[];
  image?: string;
  name?: string;
}

export interface HeliusAssetsByOwnerResponse {
  result?: {
    items?: HeliusAsset[];
  };
}

export interface FloorPriceCollection {
  name: string;
  floor: number;
}

export const PORTFOLIO_WHITELISTED_COLLECTIONS = new Set([
  "J1S9H3QjnRtBbbuD4HjPV6RpRhwuk4zKbxsnCHuTgh9w",
  "8Rt3Ayqth4DAiPnW9MDFi63TiQJHmohfTWLMQFHi4KZH",
  "SMBtHCCC6RYRutFEPb4gZqeBLUZbMNhRKaMKZZLHi7W",
  "BUjZjAS2vbbb65g7Z1Ca9ZRVYoJscURG5L3AkVvHP9ac",
  "6mszaj17KSfVqADrQj3o4W3zoLMTykgmV37W4QadCczK",
  "HJx4HRAT3RiFq7cy9fSrvP92usAmJ7bJgPccQTyroT2r",
  "1yPMtWU5aqcF72RdyRD5yipmcMRC8NGNK59NvYubLkZ",
  "J6RJFQfLgBTcoAt3KoZFiTFW9AbufsztBNDgZ7Znrp1Q",
  "CjL5WpAmf4cMEEGwZGTfTDKWok9a92ykq9aLZrEK2D5H",
  "BuAYoZPVwQw4AfeEpHTx6iGPbQtB27W7tJUjgyLzgiko",
  "2hwTMM3uWRvNny8YxSEKQkHZ8NHB5BRv7f35ccMWg1ay",
  "CywHUY59AFi7nmGf9kVfNgd39TD9rnkyx6GfWsn5iNnE",
  "6XxjKYFbcndh2gDcsUrmZgVEsoDxXMnfsaGY6fpTJzNr",
  "DSwfRF1jhhu6HpSuzaig1G19kzP73PfLZBPLofkw6fLD",
  "GMoemLuVAksjvGph8dmujuqijWsodt7nJsvwoMph3uzj",
  "7LxjzYdvXXDMxEmjS3aBC26ut4FMtDUae44nkHBPNVWP",
  "3saAedkM9o5g1u5DCqsuMZuC4GRqPB4TuMkvSsSVvGQ3",
  "7cHTjqr2S8uUCrG3TVFvFix3vcLjhPiwrtRsAeJtESRj",
  "ArqtvxDZ1nfWgnGiHYCFTLj4FSVuyf7tmkAetQ9SScyQ",
  "8vE4uASPp9WbS9Ls2qzJ9fpUBpR3UrTG3hBZXdAJQ9mz",
  "54ZnA77u7j6niHEyyD9ZZ6QAkqjCqKY4k6iPT82wxgJ8",
]);

export const COLLECTORS_CRYPT_COLLECTION = "CCryptWBYktukHDQ2vHGtVcmtjXxYzvw8XNVY64YN2Yf";
export const PHYGITALS_COLLECTION = "BSG6DyEihFFtfvxtL9mKYsvTwiZXB1rq5gARMTJC2xAM";
export const ARTIFACTE_AUTHORITY = "DDSpvAK8DbuAdEaaBHkfLieLPSJVCWWgquFAA3pvxXoX";
export const PORTFOLIO_IGNORED_ASSET_ID = "jzkJTGAuDcWthM91S1ch7wPcfMUQB5CdYH6hA25K4CS";

export function formatCompactUsd(value: number): string {
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(2)}M`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(1)}K`;
  return `$${value.toLocaleString()}`;
}

export function formatUsd(value: number): string {
  return `$${value.toLocaleString("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  })}`;
}

export function formatUsdWithCents(value: number): string {
  return `$${value.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export function formatSol(value: number): string {
  return `◎${value.toFixed(2)}`;
}

export function formatPortfolioValue(
  value: number,
  currency: PortfolioValueCurrency
): string {
  if (currency === "SOL") {
    return formatSol(value);
  }

  return value >= 1000 ? formatCompactUsd(value) : formatUsdWithCents(value);
}

export function resolvePortfolioImageSrc(src?: string): string | null {
  return resolveHomeImageSrc(src);
}

export function getPortfolioAssetHref(assetId: string): string {
  return `/auctions/cards/${assetId}`;
}