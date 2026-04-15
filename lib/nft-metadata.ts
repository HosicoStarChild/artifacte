export const METADATA_BYTE_LIMITS = {
  name: 32,
  symbol: 10,
  uri: 200,
} as const;

export const DEFAULT_NFT_SYMBOL = "Artifacte";
export const DEFAULT_COLLECTION_SYMBOL = "ARTF";
export const ADMIN_CORE_ROYALTY_BASIS_POINTS = 200;

const textEncoder = new TextEncoder();

const LANGUAGE_ABBREVIATIONS: Record<string, string> = {
  English: "EN",
  Japanese: "JP",
  Chinese: "ZH",
  Korean: "KR",
  French: "FR",
  German: "DE",
};

const CONDITION_ABBREVIATIONS: Record<string, string> = {
  "Near Mint": "NM",
  "Lightly Played": "LP",
  "Moderately Played": "MP",
  "Heavily Played": "HP",
};

const TCG_ABBREVIATIONS: Record<string, string> = {
  "One Piece": "OP",
  "Dragon Ball": "DB",
  "Yu-Gi-Oh": "YGO",
};

const VARIANT_REPLACEMENTS: Array<[RegExp, string]> = [
  [/manga\s+alternate\s+art/gi, "Manga Alt"],
  [/alternate\s+art/gi, "Alt"],
  [/special\s+illustration\s+rare/gi, "SIR"],
  [/illustration\s+rare/gi, "IR"],
  [/secret\s+rare/gi, "SEC"],
  [/super\s+rare/gi, "SR"],
  [/ultra\s+rare/gi, "UR"],
  [/hyper\s+rare/gi, "HR"],
  [/reverse\s+holo(graphic)?/gi, "Rev Holo"],
  [/first\s+edition/gi, "1st Ed"],
  [/limited\s+edition/gi, "Ltd Ed"],
];

export interface MintNameInput {
  type: "Card" | "Sealed Product";
  tcg: string;
  cardName: string;
  set: string;
  cardNumber: string;
  year: number | "";
  language: string;
  variant: string;
  condition: string;
  gradingCompany: string;
  grade: string;
  productName: string;
  sealedSet: string;
  sealedYear: number | "";
  sealedLanguage: string;
  sealedTcg: string;
}

export interface MetadataFieldStatus {
  value: string;
  bytes: number;
  fits: boolean;
}

export interface MintNameResult {
  sourceName: string;
  canonicalName: string;
  sourceBytes: number;
  canonicalBytes: number;
  wasShortened: boolean;
  fits: boolean;
}

export interface MetaplexAttribute {
  trait_type: string;
  value: string;
}

interface MetaplexMetadataOptions {
  name: string;
  description: string;
  image: string;
  imageMimeType?: string;
  symbol?: string;
  attributes?: MetaplexAttribute[];
  creatorAddress?: string;
  externalUrl?: string;
  sellerFeeBasisPoints?: number;
}

interface FitResult {
  candidate: string;
  primaryToken: string;
}

export function normalizeMetadataText(value: string | null | undefined): string {
  return (value ?? "").trim().replace(/\s+/g, " ");
}

export function normalizeMetadataUri(value: string | null | undefined): string {
  return (value ?? "").trim();
}

export function getUtf8ByteLength(value: string): number {
  return textEncoder.encode(value).length;
}

export function truncateUtf8ByBytes(value: string, maxBytes: number): string {
  const normalized = normalizeMetadataText(value);

  if (!normalized || maxBytes <= 0) {
    return "";
  }

  let result = "";
  for (const codePoint of normalized) {
    const next = `${result}${codePoint}`;
    if (getUtf8ByteLength(next) > maxBytes) {
      break;
    }
    result = next;
  }

  return result.trim();
}

export function getMetadataFieldStatus(
  value: string,
  maxBytes: number,
  kind: "text" | "uri" = "text"
): MetadataFieldStatus {
  const normalized = kind === "uri" ? normalizeMetadataUri(value) : normalizeMetadataText(value);
  const bytes = getUtf8ByteLength(normalized);

  return {
    value: normalized,
    bytes,
    fits: bytes <= maxBytes,
  };
}

export function usesMultibyteUtf8(value: string): boolean {
  const normalized = normalizeMetadataText(value);
  return normalized.length > 0 && getUtf8ByteLength(normalized) > normalized.length;
}

export function sanitizeMetadataSymbol(symbol?: string): string {
  const normalized = normalizeMetadataText(symbol || DEFAULT_NFT_SYMBOL) || DEFAULT_NFT_SYMBOL;
  return truncateUtf8ByBytes(normalized, METADATA_BYTE_LIMITS.symbol) || truncateUtf8ByBytes(DEFAULT_NFT_SYMBOL, METADATA_BYTE_LIMITS.symbol);
}

export function buildMetaplexCompatibleMetadata(options: MetaplexMetadataOptions) {
  const name = normalizeMetadataText(options.name);
  const description = normalizeMetadataText(options.description);
  const image = normalizeMetadataUri(options.image);
  const symbol = sanitizeMetadataSymbol(options.symbol);
  const creatorAddress = normalizeMetadataText(options.creatorAddress);
  const externalUrl = normalizeMetadataUri(options.externalUrl);
  const attributes = (options.attributes || [])
    .map((attribute) => ({
      trait_type: normalizeMetadataText(attribute.trait_type),
      value: normalizeMetadataText(String(attribute.value ?? "")),
    }))
    .filter((attribute) => attribute.trait_type && attribute.value);

  return {
    name,
    symbol,
    description,
    image,
    ...(externalUrl ? { external_url: externalUrl } : {}),
    seller_fee_basis_points: options.sellerFeeBasisPoints ?? ADMIN_CORE_ROYALTY_BASIS_POINTS,
    attributes,
    properties: {
      category: "image",
      files: image
        ? [
            {
              uri: image,
              type: options.imageMimeType || "image/*",
            },
          ]
        : [],
      creators: creatorAddress
        ? [
            {
              address: creatorAddress,
              share: 100,
            },
          ]
        : [],
    },
  };
}

export function buildCanonicalMintName(input: MintNameInput): MintNameResult {
  const sourceName = input.type === "Card" ? buildCardSourceName(input) : buildSealedSourceName(input);
  const sourceStatus = getMetadataFieldStatus(sourceName, METADATA_BYTE_LIMITS.name);

  if (sourceStatus.fits) {
    return {
      sourceName: sourceStatus.value,
      canonicalName: sourceStatus.value,
      sourceBytes: sourceStatus.bytes,
      canonicalBytes: sourceStatus.bytes,
      wasShortened: false,
      fits: true,
    };
  }

  const canonicalName = input.type === "Card" ? buildCompactCardName(input) : buildCompactSealedName(input);
  const canonicalStatus = getMetadataFieldStatus(canonicalName, METADATA_BYTE_LIMITS.name);

  return {
    sourceName: sourceStatus.value,
    canonicalName: canonicalStatus.value,
    sourceBytes: sourceStatus.bytes,
    canonicalBytes: canonicalStatus.bytes,
    wasShortened: canonicalStatus.value !== sourceStatus.value,
    fits: canonicalStatus.fits && Boolean(canonicalStatus.value),
  };
}

function buildCardSourceName(input: MintNameInput): string {
  const gradeOrCondition = input.condition === "Graded"
    ? joinTokens([input.gradingCompany, input.grade])
    : normalizeMetadataText(input.condition);

  return joinTokens([
    stringifyNumber(input.year),
    input.cardName,
    input.variant,
    formatCardNumber(input.cardNumber),
    gradeOrCondition,
    input.language,
    input.set,
    input.tcg,
  ]);
}

function buildSealedSourceName(input: MintNameInput): string {
  return joinTokens([
    stringifyNumber(input.sealedYear),
    input.sealedTcg,
    input.sealedSet,
    input.productName,
    input.sealedLanguage,
  ]);
}

function buildCompactCardName(input: MintNameInput): string {
  const year = stringifyNumber(input.year);
  const primary = normalizeMetadataText(input.cardName);
  const variant = compactVariant(input.variant);
  const set = normalizeMetadataText(input.set);
  const cardNumber = formatCardNumber(input.cardNumber);
  const gradeOrCondition = input.condition === "Graded"
    ? compactGrade(input.gradingCompany, input.grade)
    : compactCondition(input.condition);
  const language = compactLanguage(input.language);
  const tcg = compactTcg(input.tcg);
  const prefix = year ? [year] : [];

  const profiles = [
    [variant, set, cardNumber, gradeOrCondition, language, tcg],
    [variant, set, cardNumber, gradeOrCondition, language],
    [variant, set, cardNumber, gradeOrCondition],
    [set, cardNumber, gradeOrCondition],
    [set, gradeOrCondition],
    [cardNumber, gradeOrCondition],
    [set],
    [gradeOrCondition],
    [],
  ];

  for (const suffix of profiles) {
    const fit = fitNameProfile(prefix, primary, suffix);
    if (fit.primaryToken && getUtf8ByteLength(fit.candidate) <= METADATA_BYTE_LIMITS.name) {
      return fit.candidate;
    }
  }

  return truncateUtf8ByBytes(joinTokens(prefix.length ? [...prefix, primary] : [primary]), METADATA_BYTE_LIMITS.name);
}

function buildCompactSealedName(input: MintNameInput): string {
  const year = stringifyNumber(input.sealedYear);
  const primary = normalizeMetadataText(input.productName);
  const set = normalizeMetadataText(input.sealedSet);
  const language = compactLanguage(input.sealedLanguage);
  const tcg = compactTcg(input.sealedTcg);
  const prefix = year ? [year] : [];

  const profiles = [
    [set, tcg, language],
    [set, tcg],
    [set],
    [tcg],
    [],
  ];

  for (const suffix of profiles) {
    const fit = fitNameProfile(prefix, primary, suffix);
    if (fit.primaryToken && getUtf8ByteLength(fit.candidate) <= METADATA_BYTE_LIMITS.name) {
      return fit.candidate;
    }
  }

  return truncateUtf8ByBytes(joinTokens(prefix.length ? [...prefix, primary] : [primary]), METADATA_BYTE_LIMITS.name);
}

function fitNameProfile(prefix: string[], primary: string, suffix: string[]): FitResult {
  const normalizedPrefix = prefix.map(normalizeMetadataText).filter(Boolean);
  const normalizedSuffix = suffix.map(normalizeMetadataText).filter(Boolean);
  const normalizedPrimary = normalizeMetadataText(primary);

  if (!normalizedPrimary) {
    return {
      candidate: joinTokens([...normalizedPrefix, ...normalizedSuffix]),
      primaryToken: "",
    };
  }

  let primaryToken = "";
  for (const codePoint of normalizedPrimary) {
    const nextPrimaryToken = `${primaryToken}${codePoint}`;
    const candidate = joinTokens([...normalizedPrefix, nextPrimaryToken, ...normalizedSuffix]);
    if (getUtf8ByteLength(candidate) > METADATA_BYTE_LIMITS.name) {
      break;
    }
    primaryToken = nextPrimaryToken;
  }

  return {
    candidate: joinTokens([...normalizedPrefix, primaryToken, ...normalizedSuffix]),
    primaryToken,
  };
}

function joinTokens(tokens: Array<string | number | null | undefined>): string {
  return normalizeMetadataText(
    tokens
      .map((token) => normalizeMetadataText(String(token ?? "")))
      .filter(Boolean)
      .join(" ")
  );
}

function formatCardNumber(value: string): string {
  const normalized = normalizeMetadataText(value);
  return normalized ? `#${normalized.replace(/^#/, "")}` : "";
}

function stringifyNumber(value: number | ""): string {
  return value === "" ? "" : String(value);
}

function compactLanguage(value: string): string {
  const normalized = normalizeMetadataText(value);
  return LANGUAGE_ABBREVIATIONS[normalized] || normalized;
}

function compactCondition(value: string): string {
  const normalized = normalizeMetadataText(value);
  return CONDITION_ABBREVIATIONS[normalized] || normalized;
}

function compactTcg(value: string): string {
  const normalized = normalizeMetadataText(value);
  return TCG_ABBREVIATIONS[normalized] || normalized;
}

function compactGrade(company: string, grade: string): string {
  const normalizedCompany = normalizeMetadataText(company);
  const normalizedGrade = normalizeMetadataText(grade);
  return `${normalizedCompany}${normalizedGrade}`.trim();
}

function compactVariant(value: string): string {
  let compacted = normalizeMetadataText(value);

  for (const [pattern, replacement] of VARIANT_REPLACEMENTS) {
    compacted = compacted.replace(pattern, replacement);
  }

  return normalizeMetadataText(compacted);
}