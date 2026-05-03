import { Connection, PublicKey } from "@solana/web3.js";

import type { Listing } from "@/lib/data";
import {
  buildNftImageFallbackPath,
  resolveHeliusAssetImageSrc,
} from "@/lib/helius-asset-image";
import { resolveHomeImageSrc } from "@/lib/home-image";

import { applyArtifacteMarketplaceState } from "./artifacte-marketplace-state";

const TENSOR_MARKETPLACE = new PublicKey("TCMPhJdwDryooaGtiocG1u3xcYbRpiJzb283XfCZsDp");
const USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const AUCTION_PROGRAM_ID = new PublicKey("81s1tEx4MPdVvqS6X84Mok5K4N5fMbRLzcsT5eo2K8J3");
const SOL_MINT = "So11111111111111111111111111111111111111112";
const USD1_MINT = "USD1ttGY1N17NEEHLmELoaybftRBUSErhqYiQzvEmuB";
const ARTIFACTE_AUTHORITY = "DDSpvAK8DbuAdEaaBHkfLieLPSJVCWWgquFAA3pvxXoX";
const COLLECTOR_CRYPT_COLLECTION = "CCryptWBYktukHDQ2vHGtVcmtjXxYzvw8XNVY64YN2Yf";
const PHYGITALS_COLLECTION = "BSG6DyEihFFtfvxtL9mKYsvTwiZXB1rq5gARMTJC2xAM";
const CORE_LISTING_DISCRIMINATOR = Buffer.from([205, 178, 162, 169, 199, 166, 133, 157]);
const CORE_LISTING_SIZE = 153;
const CORE_OFFSET_SELLER = 8;
const CORE_OFFSET_PRICE = 8 + 32 + 32 + 32 + 32;
const CORE_OFFSET_CREATED_AT = CORE_OFFSET_PRICE + 8;

type AttributeValue = string | number | boolean | null | undefined;
type NumericValue = string | number | null | undefined;

type HeliusAttribute = {
  trait_type?: string;
  value?: AttributeValue;
};

type HeliusAuthority = {
  address?: string;
};

type HeliusGrouping = {
  group_key?: string;
  group_value?: string;
};

type HeliusOwnership = {
  owner?: string;
};

type HeliusLinks = {
  animation_url?: string;
  image?: string;
};

type HeliusContent = {
  links?: HeliusLinks;
  metadata?: {
    attributes?: HeliusAttribute[];
    description?: string;
    name?: string;
  };
};

type HeliusAsset = {
  attributes?: HeliusAttribute[];
  authorities?: HeliusAuthority[];
  collection?: string;
  compression?: {
    compressed?: boolean;
  };
  content?: HeliusContent;
  grouping?: HeliusGrouping[];
  id?: string;
  image?: string;
  mint?: string;
  name?: string;
  ownership?: HeliusOwnership;
};

type NftRouteResponse = {
  nft?: HeliusAsset;
  result?: HeliusAsset;
};

type ArtifacteProgramListingSnapshot = {
  id: string;
  isCore?: boolean;
  nftAddress: string;
  owner?: string;
  seller?: string;
};

type ArtifacteProgramListingsResponse = {
  listings?: ArtifacteProgramListingSnapshot[];
};

type TensorPrice = {
  seller: string | null;
  solPrice: number | null;
  usdcPrice: number | null;
};

export type AuctionListing = {
  currency: string;
  currentBid: number;
  endTime: number;
  highestBidder: string | null;
  listingType: "fixedPrice" | "auction";
  price: number;
  program: "core" | "native";
  seller: string;
  startTime: number;
  stale?: boolean;
  status: "active" | "settled" | "cancelled";
};

type OracleListing = Omit<Listing, "gradeNum" | "gradingCompany" | "vault" | "year"> & {
  auctionListing?: AuctionListing | null;
  altAssetName?: string | null;
  cardName?: string | null;
  cardNumber?: string;
  ccId?: string;
  collection?: string;
  condition?: string | null;
  gradeNum?: number | string | null;
  gradingCompany?: string | null;
  gradingId?: string | null;
  insuredValue?: number | null;
  language?: string | null;
  marketplace?: string;
  priceSource?: string;
  priceSourceId?: string;
  rarity?: string;
  seller?: string;
  sold?: boolean;
  tcg?: string;
  tcgPlayerId?: string;
  variant?: string | null;
  vault?: string | null;
  vaultLocation?: string | null;
  year?: number | string | null;
};

type OracleListingsResponse = {
  listings?: OracleListing[];
};

type OracleListingLookupOptions = {
  cardId: string;
  mint?: string;
  perPage?: number;
  source?: NonNullable<Listing["source"]>;
};

export type CardDetail = OracleListing & {
  auctionListing?: AuctionListing | null;
  category: string;
  currency: string;
  gradingId?: string | null;
  image: string;
  name: string;
  nftAddress: string;
  source: NonNullable<Listing["source"]>;
  subtitle: string;
};

function getAttributeTextValue(value: AttributeValue): string {
  return value === null || value === undefined ? "" : String(value);
}

function isLikelySolanaAddress(value: string): boolean {
  return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(value);
}

function getAssetAttributes(asset: HeliusAsset | null | undefined): HeliusAttribute[] {
  return asset?.content?.metadata?.attributes || asset?.attributes || [];
}

function getAttributeValue(attributes: readonly HeliusAttribute[], name: string): string {
  const normalizedName = name.toLowerCase();
  const matchingAttribute = attributes.find(
    (attribute) => attribute.trait_type?.toLowerCase() === normalizedName,
  );

  return getAttributeTextValue(matchingAttribute?.value);
}

function resolvePriceSourceIdentity(
  attributes: readonly HeliusAttribute[],
  listing?: Pick<OracleListing, "priceSource" | "priceSourceId" | "tcgPlayerId"> | null,
): {
  priceSource?: string;
  priceSourceId?: string;
  tcgPlayerId?: string;
} {
  const explicitPriceSource = getAttributeValue(attributes, "Price Source").trim();
  const explicitPriceSourceId = getAttributeValue(attributes, "Price Source ID").trim();
  const rawTcgPlayerId = (
    getAttributeValue(attributes, "TCGPlayer ID")
    || getAttributeValue(attributes, "TCGplayer Product ID")
    || listing?.tcgPlayerId
    || ""
  ).trim();
  const priceSourceId = (explicitPriceSourceId || listing?.priceSourceId || rawTcgPlayerId || "").trim();
  const priceSource = (explicitPriceSource || listing?.priceSource || (priceSourceId ? "TCGplayer" : "")).trim();
  const tcgPlayerId = (priceSource === "TCGplayer" ? priceSourceId : rawTcgPlayerId).trim();

  return {
    priceSource: priceSource || undefined,
    priceSourceId: priceSourceId || undefined,
    tcgPlayerId: tcgPlayerId || undefined,
  };
}

function resolveAssetDisplayName(asset: HeliusAsset | null | undefined): string {
  const attributes = getAssetAttributes(asset);
  const title = getAttributeValue(attributes, "Title").trim();
  const metadataName = asset?.content?.metadata?.name?.trim() || "";
  const metadataDescription = asset?.content?.metadata?.description?.trim() || "";
  const assetName = asset?.name?.trim() || "";

  if (title) {
    return title;
  }

  if (metadataName && !metadataName.endsWith("#")) {
    return metadataName;
  }

  if (metadataDescription) {
    return metadataDescription;
  }

  if (metadataName) {
    return metadataName;
  }

  return assetName;
}

function resolvePreferredCardName(primaryName: string | null | undefined, fallbackName: string): string {
  const trimmedPrimaryName = primaryName?.trim() || "";
  const trimmedFallbackName = fallbackName.trim();

  if (!trimmedPrimaryName) {
    return trimmedFallbackName;
  }

  if (!trimmedFallbackName) {
    return trimmedPrimaryName;
  }

  if (trimmedPrimaryName.endsWith("#") && !trimmedFallbackName.endsWith("#")) {
    return trimmedFallbackName;
  }

  if (trimmedFallbackName.length > trimmedPrimaryName.length + 8) {
    return trimmedFallbackName;
  }

  return trimmedPrimaryName;
}

function getPositiveNumber(value: NumericValue): number | null {
  const numericValue = Number(value);
  return Number.isFinite(numericValue) && numericValue > 0 ? numericValue : null;
}

function getRawListingPriceForCurrency(
  listing: { currency?: string | null; price?: NumericValue } | null | undefined,
  currency: "SOL" | "USDC",
): number | null {
  const rawPrice = getPositiveNumber(listing?.price);
  const rawCurrency = typeof listing?.currency === "string" ? listing.currency.toUpperCase() : null;
  return rawPrice && rawCurrency === currency ? rawPrice : null;
}

function getFirstPositivePrice(...candidates: NumericValue[]): number {
  for (const candidate of candidates) {
    const amount = getPositiveNumber(candidate);
    if (amount) {
      return amount;
    }
  }

  return 0;
}

function getFirstPositiveNullable(...candidates: NumericValue[]): number | null {
  for (const candidate of candidates) {
    const amount = getPositiveNumber(candidate);
    if (amount) {
      return amount;
    }
  }

  return null;
}

function parseNullableInteger(value: string): number | null {
  if (!value) {
    return null;
  }

  const parsedValue = Number.parseInt(value, 10);
  return Number.isFinite(parsedValue) ? parsedValue : null;
}

function hasAuthority(asset: HeliusAsset, address: string): boolean {
  return asset.authorities?.some((authority) => authority.address === address) || false;
}

function hasGrouping(asset: HeliusAsset, address: string): boolean {
  return asset.grouping?.some((group) => group.group_value === address) || asset.collection === address;
}

function getAssetCollectionAddress(asset: HeliusAsset | null | undefined): string | null {
  if (!asset) {
    return null;
  }

  const collectionAddress = asset.grouping?.find(
    (group) => group.group_key === "collection",
  )?.group_value;

  return collectionAddress || asset.collection || null;
}

function buildCardDetail(base: Partial<CardDetail> & Pick<CardDetail, "id" | "name">): CardDetail {
  const source = base.source || "collector-crypt";
  const category = base.category || "TCG_CARDS";
  const nftAddress = base.nftAddress || base.id;
  const image = base.image || "/placeholder-card.svg";
  const subtitle = base.subtitle || "Collectible asset";
  const currency = base.currency || (base.usdcPrice ? "USDC" : "SOL");

  return {
    ...base,
    auctionListing: base.auctionListing ?? null,
    category,
    currency,
    id: base.id,
    image,
    name: base.name,
    nftAddress,
    owner: base.owner || "",
    price: base.price ?? 0,
    solPrice: base.solPrice ?? null,
    source,
    subtitle,
    usdcPrice: base.usdcPrice ?? null,
  };
}

async function fetchArtifacteProgramListingSnapshot(mint: string): Promise<ArtifacteProgramListingSnapshot | null> {
  try {
    const response = await fetch(
      `/api/artifacte-program-listings?q=${encodeURIComponent(mint)}&perPage=10&sort=price-desc`,
    );

    if (!response.ok) {
      return null;
    }

    const payload = (await response.json()) as ArtifacteProgramListingsResponse;
    const listings = Array.isArray(payload.listings) ? payload.listings : [];
    return listings.find((listing) => listing.id === mint || listing.nftAddress === mint) || null;
  } catch {
    return null;
  }
}

async function hydrateArtifacteCard(card: CardDetail, connection: Connection): Promise<CardDetail> {
  if (card.source !== "artifacte" || !card.nftAddress) {
    return card;
  }

  const [tensorPrice, auctionListing, liveArtifacteListing, liveAsset] = await Promise.all([
    fetchTensorPrice(connection, card.nftAddress),
    fetchAuctionListing(connection, card.nftAddress),
    fetchArtifacteProgramListingSnapshot(card.nftAddress),
    fetchNftAsset(card.nftAddress),
  ]);

  const owner = liveArtifacteListing?.owner || liveAsset?.ownership?.owner || card.owner || "";
  const normalizedAuctionListing = (
    auctionListing?.program === "core"
    && owner
    && auctionListing.seller
    && owner !== auctionListing.seller
  )
    ? { ...auctionListing, price: 0, stale: true }
    : auctionListing;

  const nextCard = applyArtifacteMarketplaceState(card, {
    auctionListing: normalizedAuctionListing,
    tensorPrice: normalizedAuctionListing?.stale ? null : tensorPrice,
  });

  return {
    ...nextCard,
    collectionAddress: nextCard.collectionAddress ?? getAssetCollectionAddress(liveAsset) ?? card.collectionAddress,
    image: resolveHeliusAssetImageSrc(liveAsset, { fallbackMint: card.nftAddress }) || buildNftImageFallbackPath(card.nftAddress),
    isCore: normalizedAuctionListing?.program === "core" || liveArtifacteListing?.isCore || card.isCore,
    owner,
    seller: normalizedAuctionListing?.seller || liveArtifacteListing?.seller || nextCard.seller || "",
  };
}

async function fetchOracleListings(url: string): Promise<OracleListing[]> {
  const response = await fetch(url);
  if (!response.ok) {
    return [];
  }

  const payload = (await response.json()) as OracleListingsResponse;
  return Array.isArray(payload.listings) ? payload.listings : [];
}

async function fetchNftAsset(mint: string): Promise<HeliusAsset | null> {
  const response = await fetch(`/api/nft?mint=${mint}`);
  if (!response.ok) {
    return null;
  }

  const payload = (await response.json()) as NftRouteResponse;
  return payload.result || payload.nft || null;
}

function matchesOracleListing(
  listing: OracleListing,
  { cardId, mint, source }: OracleListingLookupOptions,
): boolean {
  if (source && typeof listing.source === "string" && listing.source !== source) {
    return false;
  }

  const collectorCryptId = cardId.startsWith("cc-") ? cardId.slice(3) : cardId;
  const candidates = new Set(
    [cardId, collectorCryptId, mint].filter((value): value is string => Boolean(value)),
  );

  return candidates.has(listing.id || "")
    || candidates.has(listing.nftAddress || "")
    || candidates.has(listing.ccId || "");
}

async function findOracleListing(options: OracleListingLookupOptions): Promise<OracleListing | null> {
  const { cardId, mint, perPage = 25, source } = options;
  const collectorCryptId = cardId.startsWith("cc-") ? cardId.slice(3) : cardId;
  const queries = Array.from(
    new Set([cardId, mint, collectorCryptId].filter((value): value is string => Boolean(value))),
  );

  for (const query of queries) {
    const params = new URLSearchParams({
      perPage: String(perPage),
      q: query,
    });

    if (source) {
      params.set("source", source);
    }

    const listings = await fetchOracleListings(`/api/me-listings?${params.toString()}`);
    const foundListing = listings.find((listing) => matchesOracleListing(listing, options));

    if (foundListing) {
      return foundListing;
    }
  }

  return null;
}

export async function fetchTensorPrice(connection: Connection, mint: string): Promise<TensorPrice | null> {
  try {
    const [listStatePda] = PublicKey.findProgramAddressSync(
      [Buffer.from("list_state"), new PublicKey(mint).toBuffer()],
      TENSOR_MARKETPLACE,
    );
    const info = await connection.getAccountInfo(listStatePda);
    if (!info || info.data.length < 82) {
      return null;
    }

    const owner = new PublicKey(info.data.subarray(10, 42)).toBase58();
    const amount = Number(info.data.readBigUInt64LE(74));
    const hasCurrency = info.data[82] === 1;
    const currencyAddress = hasCurrency ? new PublicKey(info.data.subarray(83, 115)).toBase58() : null;

    if (currencyAddress === USDC_MINT) {
      return { seller: owner, solPrice: null, usdcPrice: amount / 1e6 };
    }

    return { seller: owner, solPrice: amount / 1e9, usdcPrice: null };
  } catch {
    return null;
  }
}

export async function fetchAuctionListing(connection: Connection, mint: string): Promise<AuctionListing | null> {
  const nativeListing = await fetchNativeAuctionListing(connection, mint);

  if (nativeListing) {
    return nativeListing;
  }

  return fetchCoreAuctionListing(connection, mint);
}

async function fetchNativeAuctionListing(connection: Connection, mint: string): Promise<AuctionListing | null> {
  try {
    const nftMint = new PublicKey(mint);
    const [listingPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("listing"), nftMint.toBuffer()],
      AUCTION_PROGRAM_ID,
    );
    const [escrowNftPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("escrow_nft"), nftMint.toBuffer()],
      AUCTION_PROGRAM_ID,
    );
    const [listingInfo, escrowInfo] = await Promise.all([
      connection.getAccountInfo(listingPda),
      connection.getAccountInfo(escrowNftPda),
    ]);

    if (!listingInfo || listingInfo.data.length < 140 || !listingInfo.owner.equals(AUCTION_PROGRAM_ID)) {
      return null;
    }

    if (!escrowInfo || escrowInfo.data.length === 0) {
      const seller = new PublicKey(listingInfo.data.subarray(8, 40)).toBase58();
      const status = listingInfo.data[130];

      if (status === 0) {
        return {
          currency: "USDC",
          currentBid: 0,
          endTime: 0,
          highestBidder: null,
          listingType: "fixedPrice",
          price: 0,
          program: "native",
          seller,
          startTime: 0,
          stale: true,
          status: "active",
        };
      }

      return null;
    }

    const data = listingInfo.data;
    const seller = new PublicKey(data.subarray(8, 40)).toBase58();
    const paymentMint = new PublicKey(data.subarray(72, 104)).toBase58();
    const price = Number(data.readBigUInt64LE(104));
    const listingType = data[112];
    const startTime = Number(data.readBigInt64LE(114));
    const endTime = Number(data.readBigInt64LE(122));
    const status = data[130];

    if (status !== 0) {
      return null;
    }

    const currentBid = Number(data.readBigUInt64LE(174));
    const highestBidder = new PublicKey(data.subarray(182, 214)).toBase58();
    const defaultKey = PublicKey.default.toBase58();
    const currency = paymentMint === SOL_MINT ? "SOL" : paymentMint === USD1_MINT ? "USD1" : "USDC";
    const decimals = currency === "SOL" ? 9 : 6;

    return {
      currency,
      currentBid: currentBid / Math.pow(10, decimals),
      endTime: endTime * 1000,
      highestBidder: highestBidder !== defaultKey ? highestBidder : null,
      listingType: listingType === 0 ? "fixedPrice" : "auction",
      price: price / Math.pow(10, decimals),
      program: "native",
      seller,
      startTime: startTime * 1000,
      status: "active",
    };
  } catch {
    return null;
  }
}

async function fetchCoreAuctionListing(connection: Connection, mint: string): Promise<AuctionListing | null> {
  try {
    const nftMint = new PublicKey(mint);
    const [coreListingPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("core_listing"), nftMint.toBuffer()],
      AUCTION_PROGRAM_ID,
    );
    const coreListingInfo = await connection.getAccountInfo(coreListingPda);

    if (
      !coreListingInfo ||
      !coreListingInfo.owner.equals(AUCTION_PROGRAM_ID) ||
      coreListingInfo.data.length !== CORE_LISTING_SIZE ||
      !Buffer.from(coreListingInfo.data.subarray(0, 8)).equals(CORE_LISTING_DISCRIMINATOR)
    ) {
      return null;
    }

    const seller = new PublicKey(
      coreListingInfo.data.subarray(CORE_OFFSET_SELLER, CORE_OFFSET_SELLER + 32),
    ).toBase58();
    const price = Number(coreListingInfo.data.readBigUInt64LE(CORE_OFFSET_PRICE));
    const createdAt = Number(coreListingInfo.data.readBigInt64LE(CORE_OFFSET_CREATED_AT));

    return {
      currency: "USDC",
      currentBid: 0,
      endTime: 0,
      highestBidder: null,
      listingType: "fixedPrice",
      price: price / 1e6,
      program: "core",
      seller,
      startTime: createdAt * 1000,
      status: "active",
    };
  } catch {
    return null;
  }
}

async function loadPhygitalCard(cardId: string, connection: Connection): Promise<CardDetail | null> {
  const mint = cardId.replace("phyg-", "");

  try {
    const oracleListing = await findOracleListing({
      cardId,
      mint,
      source: "phygitals",
    });
    const [asset, auctionListing, tensorPrice] = await Promise.all([
      fetchNftAsset(mint),
      fetchAuctionListing(connection, mint),
      fetchTensorPrice(connection, mint),
    ]);
    const resolvedAssetImage = resolveHeliusAssetImageSrc(asset, { fallbackMint: mint });
    const attributes = getAssetAttributes(asset);
    const assetDisplayName = resolveAssetDisplayName(asset);
    const { priceSource, priceSourceId, tcgPlayerId } = resolvePriceSourceIdentity(attributes, oracleListing);
    const oracleSolPrice = getRawListingPriceForCurrency(oracleListing, "SOL");
    const oracleUsdcPrice = getRawListingPriceForCurrency(oracleListing, "USDC");
    const solPrice = getFirstPositivePrice(
      auctionListing?.currency === "SOL" ? auctionListing.price : null,
      tensorPrice?.solPrice,
      oracleListing?.solPrice,
      oracleSolPrice,
    );
    const usdcPrice = getFirstPositiveNullable(
      auctionListing?.currency === "USDC" ? auctionListing.price : null,
      tensorPrice?.usdcPrice,
      oracleUsdcPrice,
      oracleListing?.usdcPrice,
    );
    const listingCurrency = auctionListing?.currency
      || (tensorPrice?.usdcPrice ? "USDC" : tensorPrice?.solPrice ? "SOL" : null)
      || (usdcPrice ? "USDC" : (oracleListing?.currency || "SOL"));
    const listingPrice = auctionListing?.price || tensorPrice?.usdcPrice || tensorPrice?.solPrice || getFirstPositivePrice(
      listingCurrency === "USDC" ? usdcPrice : solPrice,
      usdcPrice,
      solPrice,
    );
    const grade = oracleListing?.grade || getAttributeValue(attributes, "Grade") || "Ungraded";
    const gradingCompanyMatch = grade.match(/^(PSA|BGS|CGC|SGC)\s/i);
    const gradeNumberMatch = grade.match(/^(?:PSA|BGS|CGC|SGC)\s+(.+)$/i);

    return buildCardDetail({
      auctionListing,
      altAssetName: oracleListing?.altAssetName ?? null,
      cardNumber: oracleListing?.cardNumber || getAttributeValue(attributes, "Card Number"),
      category: oracleListing?.category || "TCG_CARDS",
      currency: listingCurrency,
      grade,
      gradeNum: oracleListing?.gradeNum || (gradeNumberMatch ? gradeNumberMatch[1] : null),
      gradingCompany: oracleListing?.gradingCompany || (gradingCompanyMatch ? gradingCompanyMatch[1].toUpperCase() : getAttributeValue(attributes, "Grader") || null),
      gradingId: getAttributeValue(attributes, "Cert Number") || getAttributeValue(attributes, "Grading ID") || null,
      id: cardId,
      image: resolvedAssetImage || buildNftImageFallbackPath(mint),
      name: resolvePreferredCardName(oracleListing?.name, assetDisplayName || mint.slice(0, 12)),
      nftAddress: mint,
      price: listingPrice,
      priceSource,
      priceSourceId,
      rarity: oracleListing?.rarity || getAttributeValue(attributes, "Rarity"),
      marketplace: !auctionListing && (tensorPrice?.usdcPrice || tensorPrice?.solPrice) ? "tensor" : undefined,
      seller: auctionListing?.seller || tensorPrice?.seller || oracleListing?.seller || "",
      set: oracleListing?.set || getAttributeValue(attributes, "Set"),
      solPrice,
      source: "phygitals",
      subtitle: [
        getAttributeValue(attributes, "TCG") || getAttributeValue(attributes, "Category"),
        getAttributeValue(attributes, "Set"),
        getAttributeValue(attributes, "Rarity"),
        "• Phygital",
      ].filter(Boolean).join(" • ") || oracleListing?.subtitle || "• Phygital",
      tcg: oracleListing?.tcg || getAttributeValue(attributes, "TCG"),
      tcgPlayerId,
      usdcPrice,
      verifiedBy: (getAttributeValue(attributes, "Cert Number") || getAttributeValue(attributes, "Grading ID"))
        ? (getAttributeValue(attributes, "Grader") || "Graded")
        : (priceSource === "TCGplayer" || tcgPlayerId ? "TCGplayer" : "Phygitals"),
      year: oracleListing?.year || getAttributeValue(attributes, "Year"),
    });
  } catch (error) {
    console.error("[phyg] loadCard error:", error);
    return null;
  }
}

async function loadOracleCard(cardId: string, connection: Connection): Promise<CardDetail | null> {
  try {
    const foundListing = await findOracleListing({ cardId });

    if (!foundListing) {
      return null;
    }

    const card = buildCardDetail({
      ...foundListing,
      category: foundListing.category || "TCG_CARDS",
      currency: foundListing.currency || (foundListing.usdcPrice ? "USDC" : "SOL"),
      nftAddress: foundListing.nftAddress || cardId,
      source: foundListing.source || "collector-crypt",
    });
    const rawFoundSolPrice = getRawListingPriceForCurrency(card, "SOL");
    const rawFoundUsdcPrice = getRawListingPriceForCurrency(card, "USDC");

    if (!card.solPrice && rawFoundSolPrice) {
      card.solPrice = rawFoundSolPrice;
    }

    if (!card.usdcPrice && rawFoundUsdcPrice) {
      card.usdcPrice = rawFoundUsdcPrice;
    }

    if (card.currency === "USDC" && card.usdcPrice) {
      card.price = card.usdcPrice;
    } else if (card.currency === "SOL" && card.solPrice) {
      card.price = card.solPrice;
    }

    if (card.source === "phygitals" && card.nftAddress) {
      return loadPhygitalCard(`phyg-${card.nftAddress}`, connection);
    }

    if (card.source === "artifacte") {
      return hydrateArtifacteCard(card, connection);
    }

    if (card.nftAddress && isLikelySolanaAddress(card.nftAddress)) {
      card.image = buildNftImageFallbackPath(card.nftAddress);
    }

    return card;
  } catch {
    return null;
  }
}

async function loadCardFromAsset(cardId: string, connection: Connection): Promise<CardDetail | null> {
  try {
    const asset = await fetchNftAsset(cardId);
    if (!asset) {
      return null;
    }

    const attributes = getAssetAttributes(asset);
    const getAttr = (key: string) => getAttributeValue(attributes, key);
    const isArtifacte = hasAuthority(asset, ARTIFACTE_AUTHORITY);
    const isCollectorCrypt = hasGrouping(asset, COLLECTOR_CRYPT_COLLECTION);
    const isPhygital = hasGrouping(asset, PHYGITALS_COLLECTION);
    const assetDisplayName = resolveAssetDisplayName(asset);

    if (isPhygital) {
      const mintAddress = asset.id || asset.mint || cardId;
      const resolvedAssetImage = resolveHeliusAssetImageSrc(asset, { fallbackMint: mintAddress });
      const oraclePhygitalCard = await loadPhygitalCard(`phyg-${mintAddress}`, connection);
      if (oraclePhygitalCard) {
        return oraclePhygitalCard;
      }

      const grade = getAttr("Grade") || "Ungraded";
      const gradeMatch = grade.match(/^(PSA|BGS|CGC|SGC)\s+(.+)$/i);
      const { priceSource, priceSourceId, tcgPlayerId } = resolvePriceSourceIdentity(attributes);

      return buildCardDetail({
        cardNumber: getAttr("Card Number"),
        category: "TCG_CARDS",
        currency: "SOL",
        grade,
        gradeNum: gradeMatch ? gradeMatch[2] : null,
        gradingCompany: gradeMatch ? gradeMatch[1].toUpperCase() : getAttr("Grader") || null,
        gradingId: getAttr("Cert Number") || getAttr("Grading ID") || null,
        id: mintAddress,
        image: resolvedAssetImage || asset.content?.links?.animation_url || "",
        name: assetDisplayName || "Unknown",
        nftAddress: mintAddress,
        owner: asset.ownership?.owner || "",
        price: 0,
        priceSource,
        priceSourceId,
        rarity: getAttr("Rarity"),
        seller: asset.ownership?.owner || "",
        set: getAttr("Set"),
        solPrice: 0,
        source: "phygitals",
        subtitle: [getAttr("TCG"), getAttr("Set"), getAttr("Rarity"), "• Phygital"].filter(Boolean).join(" • "),
        tcg: getAttr("TCG"),
        tcgPlayerId,
        usdcPrice: null,
        verifiedBy: priceSource === "TCGplayer" || tcgPlayerId ? "TCGplayer" : "Phygitals",
        year: getAttr("Year"),
      });
    }

    if (isArtifacte) {
      const mintAddress = asset.id || asset.mint || cardId;
      const resolvedAssetImage = resolveHeliusAssetImageSrc(asset, { fallbackMint: mintAddress });
      const [tensorPrice, auctionListing] = await Promise.all([
        fetchTensorPrice(connection, mintAddress),
        fetchAuctionListing(connection, mintAddress),
      ]);

      return buildCardDetail({
        auctionListing,
        cardName: getAttr("Card Name"),
        category: "TCG_CARDS",
        ccCategory: getAttr("TCG"),
        collection: "Artifacte",
        collectionAddress: getAssetCollectionAddress(asset),
        condition: getAttr("Condition") || null,
        currency: auctionListing?.currency || (tensorPrice?.usdcPrice ? "USDC" : "SOL"),
        grade: getAttr("Condition") === "Graded"
          ? `${getAttr("Grading Company")} ${getAttr("Grade")}`.trim()
          : getAttr("Condition"),
        gradeNum: getAttr("Grade") || null,
        gradingCompany: getAttr("Grading Company") || null,
        gradingId: getAttr("Grading ID") || null,
        id: mintAddress,
        image: resolvedAssetImage || "",
        insuredValue: null,
        language: getAttr("Language") || null,
        name: assetDisplayName || "Unknown",
        nftAddress: mintAddress,
        owner: asset.ownership?.owner || "",
        price: auctionListing?.price || tensorPrice?.usdcPrice || tensorPrice?.solPrice || 0,
        priceSource: getAttr("Price Source") || undefined,
        priceSourceId: getAttr("Price Source ID") || undefined,
        seller: auctionListing?.seller || tensorPrice?.seller || asset.ownership?.owner,
        set: getAttr("Set"),
        solPrice: tensorPrice?.solPrice || 0,
        source: "artifacte",
        subtitle: getAttr("Set") || "Artifacte card",
        usdcPrice: tensorPrice?.usdcPrice || null,
        variant: getAttr("Variant") || null,
        vault: null,
        year: getAttr("Year"),
      });
    }

    if (isCollectorCrypt) {
      const mintAddress = asset.id || asset.mint || cardId;
      const resolvedAssetImage = resolveHeliusAssetImageSrc(asset, { fallbackMint: mintAddress });
      const [tensorPrice, auctionListing] = await Promise.all([
        fetchTensorPrice(connection, mintAddress),
        fetchAuctionListing(connection, mintAddress),
      ]);

      return buildCardDetail({
        auctionListing,
        category: "TCG_CARDS",
        ccCategory: getAttr("Category"),
        collection: "Collectors Crypt",
        currency: auctionListing?.currency || (tensorPrice?.usdcPrice ? "USDC" : "SOL"),
        grade: `${getAttr("Grading Company")} ${getAttr("The Grade") || getAttr("GradeNum")}`.trim(),
        gradeNum: getAttr("GradeNum") || null,
        gradingCompany: getAttr("Grading Company") || null,
        gradingId: getAttr("Grading ID") || null,
        id: mintAddress,
        image: resolvedAssetImage || "",
        insuredValue: parseNullableInteger(getAttr("Insured Value")),
        marketplace: !auctionListing && (tensorPrice?.usdcPrice || tensorPrice?.solPrice) ? "tensor" : undefined,
        name: assetDisplayName || "Unknown",
        nftAddress: mintAddress,
        owner: asset.ownership?.owner || "",
        price: auctionListing?.price || tensorPrice?.usdcPrice || tensorPrice?.solPrice || 0,
        seller: auctionListing?.seller || tensorPrice?.seller || asset.ownership?.owner,
        solPrice: tensorPrice?.solPrice || 0,
        source: "collector-crypt",
        subtitle: `${getAttr("Category")} • ${getAttr("Grading Company")} ${getAttr("GradeNum")} • ${getAttr("Vault") || "Vault"}`,
        usdcPrice: tensorPrice?.usdcPrice || null,
        vault: getAttr("Vault"),
        year: getAttr("Year"),
      });
    }

    return null;
  } catch {
    return null;
  }
}

export async function loadCardDetail(cardId: string, connection: Connection): Promise<CardDetail | null> {
  if (cardId.startsWith("phyg-")) {
    const phygitalCard = await loadPhygitalCard(cardId, connection);
    if (phygitalCard) {
      return phygitalCard;
    }
  }

  const oracleCard = await loadOracleCard(cardId, connection);
  if (oracleCard) {
    return oracleCard;
  }

  return loadCardFromAsset(cardId, connection);
}

export function formatListingQuote(amount: number, currency: string): string {
  const formattedAmount = amount.toLocaleString(
    undefined,
    currency === "SOL" ? { maximumFractionDigits: 4 } : undefined,
  );

  return currency === "SOL"
    ? `◎ ${formattedAmount} SOL`
    : `$${formattedAmount} ${currency}`;
}

export function getCardBackHref(category: string, source?: string): string {
  if (source === "artifacte") {
    return "/auctions/categories/artifacte";
  }

  if (category === "MERCHANDISE") {
    return "/auctions/categories/merchandise";
  }

  if (category === "SEALED") {
    return "/auctions/categories/sealed";
  }

  if (category === "SPORTS_CARDS") {
    return "/auctions/categories/sports-cards";
  }

  return "/auctions/categories/tcg-cards";
}

export function getCardBackLabel(category: string, source?: string): string {
  if (source === "artifacte") {
    return "Artifacte";
  }

  if (category === "MERCHANDISE") {
    return "Merchandise";
  }

  if (category === "SEALED") {
    return "Sealed Product";
  }

  if (category === "SPORTS_CARDS") {
    return "Sports Cards";
  }

  return "TCG Cards";
}

export function resolveCardImageSrc(src?: string, mint?: string): string {
  if (!src) {
    return mint ? buildNftImageFallbackPath(mint) : "/placeholder-card.svg";
  }

  const normalizedSource = src.startsWith("ipfs://")
    ? src.replace("ipfs://", "https://nftstorage.link/ipfs/")
    : src;

  return resolveHomeImageSrc(normalizedSource)
    || (mint ? buildNftImageFallbackPath(mint) : "/placeholder-card.svg");
}
