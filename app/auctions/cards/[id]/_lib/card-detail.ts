import { Connection, PublicKey } from "@solana/web3.js";

import type { Listing } from "@/lib/data";
import {
  buildNftImageFallbackPath,
  resolveHeliusAssetImageSrc,
} from "@/lib/helius-asset-image";
import { resolveHomeImageSrc } from "@/lib/home-image";

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
    price: base.price ?? 0,
    solPrice: base.solPrice ?? null,
    source,
    subtitle,
    usdcPrice: base.usdcPrice ?? null,
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
    const oracleListings = await fetchOracleListings(
      `/api/me-listings?category=TCG_CARDS&q=${encodeURIComponent(mint)}&perPage=1`,
    );
    const oracleListing = oracleListings.find((listing) => listing.id === cardId || listing.nftAddress === mint) || null;
    const [asset, auctionListing] = await Promise.all([
      fetchNftAsset(mint),
      fetchAuctionListing(connection, mint),
    ]);
    const resolvedAssetImage = resolveHeliusAssetImageSrc(asset, { fallbackMint: mint });
    const attributes = getAssetAttributes(asset);
    const tcgPlayerId = getAttributeValue(attributes, "TCGPlayer ID")
      || getAttributeValue(attributes, "TCGplayer Product ID")
      || oracleListing?.tcgPlayerId
      || "";
    const oracleSolPrice = getRawListingPriceForCurrency(oracleListing, "SOL");
    const oracleUsdcPrice = getRawListingPriceForCurrency(oracleListing, "USDC");
    const solPrice = getFirstPositivePrice(
      auctionListing?.currency === "SOL" ? auctionListing.price : null,
      oracleListing?.solPrice,
      oracleSolPrice,
    );
    const usdcPrice = getFirstPositiveNullable(
      auctionListing?.currency === "USDC" ? auctionListing.price : null,
      oracleUsdcPrice,
      oracleListing?.usdcPrice,
    );
    const listingCurrency = auctionListing?.currency || (usdcPrice ? "USDC" : (oracleListing?.currency || "SOL"));
    const listingPrice = auctionListing?.price || getFirstPositivePrice(
      listingCurrency === "USDC" ? usdcPrice : solPrice,
      usdcPrice,
      solPrice,
    );
    const grade = oracleListing?.grade || getAttributeValue(attributes, "Grade") || "Ungraded";
    const gradingCompanyMatch = grade.match(/^(PSA|BGS|CGC|SGC)\s/i);
    const gradeNumberMatch = grade.match(/^(?:PSA|BGS|CGC|SGC)\s+(.+)$/i);

    return buildCardDetail({
      auctionListing,
      cardNumber: oracleListing?.cardNumber || getAttributeValue(attributes, "Card Number"),
      category: "TCG_CARDS",
      currency: listingCurrency,
      grade,
      gradeNum: oracleListing?.gradeNum || (gradeNumberMatch ? gradeNumberMatch[1] : null),
      gradingCompany: oracleListing?.gradingCompany || (gradingCompanyMatch ? gradingCompanyMatch[1].toUpperCase() : getAttributeValue(attributes, "Grader") || null),
      gradingId: getAttributeValue(attributes, "Cert Number") || getAttributeValue(attributes, "Grading ID") || null,
      id: cardId,
      image: oracleListing?.image || resolvedAssetImage || "",
      name: oracleListing?.name || asset?.name || mint.slice(0, 12),
      nftAddress: mint,
      price: listingPrice,
      priceSource: tcgPlayerId ? "TCGplayer" : undefined,
      priceSourceId: tcgPlayerId || undefined,
      rarity: oracleListing?.rarity || getAttributeValue(attributes, "Rarity"),
      seller: auctionListing?.seller || oracleListing?.seller || "",
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
        : (tcgPlayerId ? "TCGplayer" : "Phygitals"),
      year: oracleListing?.year || getAttributeValue(attributes, "Year"),
    });
  } catch (error) {
    console.error("[phyg] loadCard error:", error);
    return null;
  }
}

async function loadOracleCard(cardId: string, connection: Connection): Promise<CardDetail | null> {
  try {
    const collectorCryptId = cardId.replace("cc-", "");
    const listings = await fetchOracleListings(`/api/me-listings?q=${encodeURIComponent(collectorCryptId)}&perPage=5`);
    const foundListing = listings.find(
      (listing) => listing.id === cardId || listing.nftAddress === cardId || listing.ccId === collectorCryptId,
    );

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

    if (isPhygital) {
      const mintAddress = asset.id || asset.mint || cardId;
      const resolvedAssetImage = resolveHeliusAssetImageSrc(asset, { fallbackMint: mintAddress });
      const oraclePhygitalCard = await loadPhygitalCard(`phyg-${mintAddress}`, connection);
      if (oraclePhygitalCard) {
        return oraclePhygitalCard;
      }

      const grade = getAttr("Grade") || "Ungraded";
      const gradeMatch = grade.match(/^(PSA|BGS|CGC|SGC)\s+(.+)$/i);
      const tcgPlayerId = getAttr("TCGPlayer ID") || getAttr("TCGplayer Product ID") || "";

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
        name: asset.content?.metadata?.name || "Unknown",
        nftAddress: mintAddress,
        price: 0,
        priceSource: tcgPlayerId ? "TCGplayer" : undefined,
        priceSourceId: tcgPlayerId || undefined,
        rarity: getAttr("Rarity"),
        seller: asset.ownership?.owner || "",
        set: getAttr("Set"),
        solPrice: 0,
        source: "phygitals",
        subtitle: [getAttr("TCG"), getAttr("Set"), getAttr("Rarity"), "• Phygital"].filter(Boolean).join(" • "),
        tcg: getAttr("TCG"),
        tcgPlayerId,
        usdcPrice: null,
        verifiedBy: "TCGplayer",
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
        name: asset.content?.metadata?.name || asset.name || "Unknown",
        nftAddress: mintAddress,
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
        name: asset.content?.metadata?.name || asset.name || "Unknown",
        nftAddress: mintAddress,
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

export function getCardBackHref(category: string): string {
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

export function getCardBackLabel(category: string): string {
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