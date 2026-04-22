import type {
  HeliusAsset,
  HeliusAssetContent,
  HeliusAssetGrouping,
  HeliusAssetMetadata,
  HeliusAssetMetadataAttribute,
} from "@/lib/portfolio";

export type ListPageListingMode = "fixed" | "auction";
export type ListPageAssetSectionId = "rwa" | "digital";

export interface ListPageAssetContent extends HeliusAssetContent {
  metadata?: HeliusAssetMetadata & {
    description?: string;
    symbol?: string;
    attributes?: HeliusAssetMetadataAttribute[];
  };
  json_uri?: string;
}

export interface ListPageAssetCompression {
  compressed?: boolean;
}

export interface ListPageAssetOwnership {
  owner?: string;
}

export interface ListPageAssetAuthority {
  address?: string;
}

export interface ListPageAssetRoyalty {
  basis_points?: number;
}

export interface ListPageAsset extends Omit<HeliusAsset, "content" | "grouping" | "authorities"> {
  authorities?: ListPageAssetAuthority[];
  burnt?: boolean;
  compression?: ListPageAssetCompression;
  content?: ListPageAssetContent;
  grouping?: HeliusAssetGrouping[];
  interface?: string;
  nftAddress?: string;
  ownership?: ListPageAssetOwnership;
  royalty?: ListPageAssetRoyalty;
}

export interface ListPageAssetCollection {
  address: string;
  name: string;
}

export interface ListPageAssetFlags {
  isArtifacteAuthority: boolean;
  isCompressed: boolean;
  isCore: boolean;
  isPnft: boolean;
  isRwa: boolean;
}

export interface ListPageAssetCardModel {
  asset: ListPageAsset;
  collection: ListPageAssetCollection;
  flags: ListPageAssetFlags;
  id: string;
  imageAlt: string;
  imageClassName: string;
  imageSrc: string;
  mintAddress: string;
  name: string;
}

export interface ListPageAssetSection {
  accentClassName: string;
  description: string;
  id: ListPageAssetSectionId;
  items: ListPageAssetCardModel[];
  title: string;
}

export interface ListPageRoyaltyMetadata {
  creators: ListPageAssetAuthority[];
  mintExtensions: {
    metadata?: {
      additional_metadata?: Array<[string, string]>;
    };
  } | null;
  royalty: ListPageAssetRoyalty;
  ruleSetAddress?: string;
}

export interface ListPageNftApiResponse {
  nft: {
    attributes?: HeliusAssetMetadataAttribute[];
    authorities?: ListPageAssetAuthority[];
    collection?: string;
    creators?: ListPageAssetAuthority[];
    description?: string;
    image?: string;
    mint?: string;
    mint_extensions?: ListPageRoyaltyMetadata["mintExtensions"];
    name?: string;
    royalty?: ListPageAssetRoyalty;
    symbol?: string;
  };
  result?: {
    programmable_config?: {
      rule_set?: string;
    };
  };
}

export interface ListPageHeliusDasResponse {
  result?: {
    items?: ListPageAsset[];
  };
}

export interface ListPageTensorBuildResponse {
  mint: string;
  tx: string;
}

export interface ListPageErrorResponse {
  error?: string;
}

export interface ListPageSelectionState {
  auctionDuration: string;
  price: string;
  selectedAsset: ListPageAsset | null;
}

export interface ListPageRoyaltyState {
  loading: boolean;
  royaltyBps: number;
}