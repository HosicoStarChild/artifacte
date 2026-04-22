import { ItemCategory } from "@/lib/auction-program";
import type { AllowlistEntry } from "@/lib/allowlist";
import { resolveHomeImageSrc } from "@/lib/home-image";

import {
  LIST_PAGE_ARTIFACTE_AUTHORITY,
  LIST_PAGE_CC_COLLECTION,
  LIST_PAGE_PHYG_COLLECTION,
} from "./constants";
import type {
  ListPageAsset,
  ListPageAssetCardModel,
  ListPageAssetCollection,
  ListPageAssetFlags,
  ListPageAssetSection,
} from "./types";

function getCollectionGroupValue(asset: ListPageAsset): string | undefined {
  return asset.grouping?.find((group) => group.group_key === "collection")?.group_value;
}

function getAssetAuthorities(asset: ListPageAsset): string[] {
  return asset.authorities?.flatMap((authority) =>
    authority.address ? [authority.address] : []
  ) ?? [];
}

export function createAllowlistNameMap(entries: AllowlistEntry[]): Record<string, string> {
  const namesByIdentifier: Record<string, string> = {};

  for (const entry of entries) {
    if (entry.collectionAddress) {
      namesByIdentifier[entry.collectionAddress] = entry.name;
    }

    if (entry.mintAuthority) {
      namesByIdentifier[entry.mintAuthority] = entry.name;
    }
  }

  return namesByIdentifier;
}

export function getAllowedCollectionNames(entries: AllowlistEntry[]): string[] {
  return Array.from(new Set(entries.map((entry) => entry.name))).sort((left, right) =>
    left.localeCompare(right)
  );
}

export function isCompressedPhygitalAsset(asset: ListPageAsset): boolean {
  return asset.compression?.compressed === true && getCollectionGroupValue(asset) === LIST_PAGE_PHYG_COLLECTION;
}

export function isListableAsset(asset: ListPageAsset): boolean {
  if (asset.burnt) {
    return false;
  }

  if (asset.interface === "FungibleToken" || asset.interface === "FungibleAsset") {
    return false;
  }

  if (asset.compression?.compressed) {
    return isCompressedPhygitalAsset(asset);
  }

  return true;
}

export function getAssetFlags(asset: ListPageAsset): ListPageAssetFlags {
  const collectionAddress = getCollectionGroupValue(asset);
  const authorityAddresses = getAssetAuthorities(asset);
  const isArtifacteAuthority = authorityAddresses.includes(LIST_PAGE_ARTIFACTE_AUTHORITY);
  const isRwa =
    collectionAddress === LIST_PAGE_CC_COLLECTION ||
    collectionAddress === LIST_PAGE_PHYG_COLLECTION ||
    isArtifacteAuthority;

  return {
    isArtifacteAuthority,
    isCompressed: asset.compression?.compressed === true,
    isCore: asset.interface === "MplCoreAsset",
    isPnft: asset.interface === "ProgrammableNFT",
    isRwa,
  };
}

export function getAssetCategory(asset: ListPageAsset): ItemCategory {
  const flags = getAssetFlags(asset);

  if (!flags.isRwa) {
    return ItemCategory.DigitalArt;
  }

  const attributes = asset.content?.metadata?.attributes ?? [];

  const getAttributeValue = (traitName: string): string => {
    const attribute = attributes.find(
      (item) => item.trait_type?.toLowerCase() === traitName.toLowerCase()
    );

    return typeof attribute?.value === "string" ? attribute.value : "";
  };

  const tcg = getAttributeValue("TCG") || getAttributeValue("Category") || getAttributeValue("Type");
  const sport = getAttributeValue("Sport");

  if (sport) {
    return ItemCategory.SportsCards;
  }

  if (tcg) {
    return ItemCategory.TCGCards;
  }

  return ItemCategory.TCGCards;
}

export function getAssetCollection(
  asset: ListPageAsset,
  allowlistNameMap: Record<string, string>
): ListPageAssetCollection | null {
  const authorityAddresses = getAssetAuthorities(asset);

  if (authorityAddresses.includes(LIST_PAGE_ARTIFACTE_AUTHORITY)) {
    return {
      address: LIST_PAGE_ARTIFACTE_AUTHORITY,
      name: "The Artifacte Collection",
    };
  }

  const collectionAddress = getCollectionGroupValue(asset);
  if (collectionAddress === LIST_PAGE_CC_COLLECTION) {
    return { address: collectionAddress, name: "Collectors Crypt" };
  }

  if (collectionAddress === LIST_PAGE_PHYG_COLLECTION) {
    return { address: collectionAddress, name: "Phygitals" };
  }

  if (collectionAddress && allowlistNameMap[collectionAddress]) {
    return {
      address: collectionAddress,
      name: allowlistNameMap[collectionAddress],
    };
  }

  for (const authorityAddress of authorityAddresses) {
    const name = allowlistNameMap[authorityAddress];
    if (name) {
      return { address: authorityAddress, name };
    }
  }

  return null;
}

export function resolveListPageImageSrc(asset: ListPageAsset): string {
  const cdnUri = asset.content?.files?.find((file) => file.cdn_uri)?.cdn_uri;

  if (cdnUri && cdnUri.length > 40 && !cdnUri.endsWith("//")) {
    return resolveHomeImageSrc(cdnUri) ?? "/placeholder.png";
  }

  const imageLink = asset.content?.links?.image?.trim();

  if (!imageLink || imageLink.startsWith("data:")) {
    return `/api/nft-image?mint=${encodeURIComponent(asset.id)}`;
  }

  const normalized = imageLink.startsWith("ipfs://")
    ? imageLink.replace("ipfs://", "https://nftstorage.link/ipfs/")
    : imageLink;

  if (
    normalized.includes("arweave.net/") ||
    normalized.includes("nftstorage.link/") ||
    normalized.includes("/ipfs/") ||
    normalized.includes("irys.xyz/")
  ) {
    return `/api/img-proxy?url=${encodeURIComponent(normalized)}`;
  }

  return resolveHomeImageSrc(normalized) ?? "/placeholder.png";
}

export function toAssetCardModel(
  asset: ListPageAsset,
  allowlistNameMap: Record<string, string>
): ListPageAssetCardModel | null {
  const collection = getAssetCollection(asset, allowlistNameMap);
  if (!collection) {
    return null;
  }

  const flags = getAssetFlags(asset);
  const name = asset.content?.metadata?.name?.trim() || asset.name?.trim() || "Unnamed";

  return {
    asset,
    collection,
    flags,
    id: asset.id,
    imageAlt: name,
    imageClassName: flags.isRwa ? "object-contain p-2" : "object-cover",
    imageSrc: resolveListPageImageSrc(asset),
    mintAddress: asset.nftAddress || asset.id,
    name,
  };
}

export function buildAssetSections(
  assets: ListPageAsset[],
  allowlistNameMap: Record<string, string>
): ListPageAssetSection[] {
  const cards = assets
    .filter(isListableAsset)
    .map((asset) => toAssetCardModel(asset, allowlistNameMap))
    .filter((card): card is ListPageAssetCardModel => card !== null);

  const rwaItems = cards.filter((card) => card.flags.isRwa);
  const digitalItems = cards.filter((card) => !card.flags.isRwa);

  const sections: ListPageAssetSection[] = [];

  if (rwaItems.length > 0) {
    sections.push({
      accentClassName: "text-gold-400",
      description: "RWA Cards",
      id: "rwa",
      items: rwaItems,
      title: "RWA Cards",
    });
  }

  if (digitalItems.length > 0) {
    sections.push({
      accentClassName: "text-blue-400",
      description: "Digital Collectibles",
      id: "digital",
      items: digitalItems,
      title: "Digital Collectibles",
    });
  }

  return sections;
}

export function getAssetSelectionListingMode(asset: ListPageAsset): "fixed" | "auction" {
  const flags = getAssetFlags(asset);
  return flags.isCompressed || flags.isRwa || flags.isCore ? "fixed" : "auction";
}

export function isAuctionAllowed(asset: ListPageAsset): boolean {
  const flags = getAssetFlags(asset);
  return !flags.isCompressed && !flags.isRwa && !flags.isCore;
}

export function getListingTypeHint(asset: ListPageAsset): string | null {
  const flags = getAssetFlags(asset);

  if (flags.isCore) {
    return "Artifacte Core assets support fixed-price USDC listings only.";
  }

  if (flags.isRwa) {
    return flags.isArtifacteAuthority
      ? "Artifacte collection NFTs are listed exclusively on the Artifacte platform."
      : "Auctions are only available for Digital Collectibles. RWA cards support fixed-price listings only.";
  }

  if (flags.isCompressed) {
    return "Auctions are not available for compressed NFTs. Only fixed-price listings are supported.";
  }

  return null;
}

export function getListingCurrencyLabel(asset: ListPageAsset): "SOL" | "USDC" {
  const flags = getAssetFlags(asset);
  return flags.isCore || getAssetCategory(asset) !== ItemCategory.DigitalArt ? "USDC" : "SOL";
}

export function getListingPriceSymbol(asset: ListPageAsset): "$" | "◎" {
  return getListingCurrencyLabel(asset) === "USDC" ? "$" : "◎";
}

export function getEligibleAssetsCount(sections: ListPageAssetSection[]): number {
  return sections.reduce((count, section) => count + section.items.length, 0);
}