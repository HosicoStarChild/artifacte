"use client";

import Image from "next/image";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { useEffect, useState, type ChangeEvent } from "react";
import { SendTransactionError, type Connection } from "@solana/web3.js";
import { ARTIFACTE_COLLECTION, TREASURY_WALLET } from "@/lib/data";
import { createUmi } from "@metaplex-foundation/umi-bundle-defaults";
import { walletAdapterIdentity } from "@metaplex-foundation/umi-signer-wallet-adapters";
import { addCollectionPlugin, createV1, createCollectionV1, fetchCollection, hasCollectionUpdateAuthority, pluginAuthorityPair, ruleSet, updateCollectionPlugin } from "@metaplex-foundation/mpl-core";
import { generateSigner, publicKey as umiPublicKey, type TransactionBuilder, type Umi } from "@metaplex-foundation/umi";
import { irysUploader } from "@metaplex-foundation/umi-uploader-irys";
import {
  ADMIN_CORE_ROYALTY_BASIS_POINTS,
  buildCanonicalMintName,
  buildMetaplexCompatibleMetadata,
  DEFAULT_COLLECTION_SYMBOL,
  DEFAULT_NFT_SYMBOL,
  getMetadataFieldStatus,
  getUtf8ByteLength,
  METADATA_BYTE_LIMITS,
  usesMultibyteUtf8,
} from "@/lib/nft-metadata";

interface MintFormData {
  // Basic Info
  type: "Card" | "Sealed Product";
  tcg: "Pokemon" | "One Piece" | "Dragon Ball" | "Yu-Gi-Oh" | "Sports" | "Other";
  name: string;

  // Card Details
  cardName: string;
  set: string;
  cardNumber: string;
  year: number | "";
  language: "English" | "Japanese" | "Chinese" | "Korean" | "French" | "German";
  variant: string;
  condition: "Graded" | "Near Mint" | "Lightly Played" | "Moderately Played" | "Heavily Played";

  // Grading (when condition = Graded)
  gradingCompany: "PSA" | "BGS" | "CGC";
  grade: string;
  gradeLabel: string;
  certNumber: string;

  // Sealed Details
  productName: string;
  sealedSet: string;
  sealedYear: number | "";
  sealedLanguage: "English" | "Japanese" | "Chinese" | "Korean" | "French" | "German";
  sealedTcg: "Pokemon" | "One Piece" | "Dragon Ball" | "Yu-Gi-Oh" | "Sports" | "Other";

  // Price Source
  priceSource: "Alt.xyz" | "TCGplayer" | "None";
  priceSourceId: string;
  priceSourceName: string; // display name from search result

  // Images
  frontImage: File | null;
  frontImagePreview: string;
  backImage: File | null;
  backImagePreview: string;

  // Recipient
  recipientWallet: string;
}

interface CollectionAccessState {
  checking: boolean;
  canUse: boolean | null;
  message: string | null;
  royaltyBasisPoints: number | null;
  updateAuthority: string | null;
}

interface CollectionValidationResult {
  canUse: boolean;
  normalizedAddress: string;
  updateAuthority?: string;
  royaltyBasisPoints?: number;
  message: string;
}

interface PriceSearchResult {
  id: string;
  language: string;
  name: string;
  price: string;
  variety: string;
}

interface AltOracleVariant {
  assetId?: string;
  language?: string;
  name?: string;
  price?: number;
  subject?: string;
  variety?: string;
}

interface AltOracleSearchResponse {
  variants?: AltOracleVariant[];
}

interface TcgPlayerSearchResult {
  marketPrice?: number;
  name?: string;
  printingType?: string;
  productId?: number | string;
  variant?: string;
}

interface TcgPlayerSearchResponse {
  results?: TcgPlayerSearchResult[];
}

type ImageField = "frontImage" | "backImage";
type PreviewField = "frontImagePreview" | "backImagePreview";
type ErrorWithLogs = Error & { logs?: string[] };
type SignatureStatusValue = Awaited<ReturnType<Connection["getSignatureStatus"]>>["value"];

const ADMIN_CONFIRMATION_INTERVAL_MS = 1_500;
const ADMIN_CONFIRMATION_TIMEOUT_MS = 60_000;

function isConfirmedSignatureStatus(status: SignatureStatusValue | undefined): boolean {
  return status?.confirmationStatus === "confirmed" || status?.confirmationStatus === "finalized";
}

function formatRoyaltyBasisPoints(basisPoints: number): string {
  const royaltyPercent = basisPoints / 100;
  return `${Number.isInteger(royaltyPercent) ? royaltyPercent.toFixed(0) : royaltyPercent.toFixed(2)}%`;
}

function getSignatureFailureMessage(
  signatureValue: string,
  status: SignatureStatusValue | undefined
): string | null {
  if (!status?.err) {
    return null;
  }

  return `Transaction ${signatureValue} failed on-chain: ${JSON.stringify(status.err)}`;
}

async function waitForConfirmedSignature(
  connection: Connection,
  signatureValue: string
): Promise<void> {
  const startedAt = Date.now();

  while (Date.now() - startedAt < ADMIN_CONFIRMATION_TIMEOUT_MS) {
    const statusResponse = await connection.getSignatureStatus(signatureValue, {
      searchTransactionHistory: true,
    });
    const status = statusResponse.value;
    const failureMessage = getSignatureFailureMessage(signatureValue, status);

    if (failureMessage) {
      throw new Error(failureMessage);
    }

    if (isConfirmedSignatureStatus(status)) {
      return;
    }

    await new Promise<void>((resolve) => {
      setTimeout(resolve, ADMIN_CONFIRMATION_INTERVAL_MS);
    });
  }

  const finalStatusResponse = await connection.getSignatureStatus(signatureValue, {
    searchTransactionHistory: true,
  });
  const finalStatus = finalStatusResponse.value;
  const failureMessage = getSignatureFailureMessage(signatureValue, finalStatus);

  if (failureMessage) {
    throw new Error(failureMessage);
  }

  if (isConfirmedSignatureStatus(finalStatus)) {
    return;
  }

  throw new Error(
    `Transaction confirmation timeout. Signature: ${signatureValue}. Check Solana Explorer before retrying.`
  );
}

async function requestSignatureAndSendFromFrontend(
  builder: TransactionBuilder,
  umi: Umi,
  connection: Connection
): Promise<string> {
  const signedTransaction = await builder.buildAndSign(umi);
  const serializedTransaction = umi.transactions.serialize(signedTransaction);
  const signatureValue = await connection.sendRawTransaction(serializedTransaction, {
    maxRetries: 5,
    preflightCommitment: "confirmed",
    skipPreflight: false,
  });

  await waitForConfirmedSignature(connection, signatureValue);

  return signatureValue;
}

function PreviewImage({ alt, src }: { alt: string; src: string }) {
  return (
    <div className="relative mt-2 h-24 w-full overflow-hidden rounded-lg border border-white/10">
      <Image
        alt={alt}
        className="object-cover"
        fill
        sizes="(max-width: 1024px) 50vw, 240px"
        src={src}
        unoptimized
      />
    </div>
  );
}

async function validateCollectionAccess(
  rpcEndpoint: string,
  collectionAddress: string,
  walletAddress: string
): Promise<CollectionValidationResult> {
  const normalizedAddress = collectionAddress.trim();

  if (!normalizedAddress) {
    return {
      canUse: true,
      normalizedAddress: "",
      message: "",
    };
  }

  try {
    const umi = createUmi(rpcEndpoint);
    const collection = await fetchCollection(umi, normalizedAddress);
    const updateAuthority = String(collection.updateAuthority);
    const canUse = hasCollectionUpdateAuthority(walletAddress, collection);
    const royaltyBasisPoints = typeof collection.royalties?.basisPoints === "number"
      ? Number(collection.royalties.basisPoints)
      : undefined;

    if (canUse) {
      return {
        canUse: true,
        normalizedAddress,
        updateAuthority,
        royaltyBasisPoints,
        message: `Collection ready. This wallet is authorized for ${normalizedAddress}.`,
      };
    }

    return {
      canUse: false,
      normalizedAddress,
      updateAuthority,
      royaltyBasisPoints,
      message: `Selected collection is controlled by ${updateAuthority}. Wallet ${walletAddress} cannot mint into it. Clear the collection field, create a new collection with this wallet, or switch wallets.`,
    };
  } catch {
    return {
      canUse: false,
      normalizedAddress,
      message: `Could not load Metaplex Core collection ${normalizedAddress}. Check the address or leave the field empty to mint without a collection.`,
    };
  }
}

/** Embeddable form content (no auth check, no page wrapper) — used by admin tab */
export function MintFormContent() {
  return <MintFormInner />;
}

function MintFormInner() {
  const [formData, setFormData] = useState<MintFormData>({
    type: "Card",
    tcg: "Pokemon",
    name: "",
    cardName: "",
    set: "",
    cardNumber: "",
    year: "",
    language: "English",
    variant: "",
    condition: "Near Mint",
    gradingCompany: "PSA",
    grade: "",
    gradeLabel: "",
    certNumber: "",
    productName: "",
    sealedSet: "",
    sealedYear: "",
    sealedLanguage: "English",
    sealedTcg: "Pokemon",
    priceSource: "Alt.xyz",
    priceSourceId: "",
    priceSourceName: "",
    frontImage: null,
    frontImagePreview: "",
    backImage: null,
    backImagePreview: "",
    recipientWallet: "",
  });

  const [searchResults, setSearchResults] = useState<PriceSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const mintName = buildCanonicalMintName(formData);
  const nameStatus = getMetadataFieldStatus(mintName.canonicalName, METADATA_BYTE_LIMITS.name);
  const symbolStatus = getMetadataFieldStatus(DEFAULT_NFT_SYMBOL, METADATA_BYTE_LIMITS.symbol);
  const nameUsesMultibyte = usesMultibyteUtf8(mintName.sourceName);

  // Search Alt.xyz / TCGplayer for matching cards
  const handlePriceSourceSearch = async () => {
    setSearching(true);
    setSearchResults([]);
    try {
      const query = [formData.cardName, formData.variant, formData.set, formData.tcg, formData.language, formData.condition === "Graded" ? `${formData.gradingCompany} ${formData.grade}` : ""].filter(Boolean).join(" ");
      
      if (formData.priceSource === "Alt.xyz") {
        const res = await fetch(`/api/oracle?endpoint=search&q=${encodeURIComponent(query)}`);
        if (res.ok) {
          const data: AltOracleSearchResponse = await res.json();
          const variants = data.variants ?? [];
          setSearchResults(
            variants.slice(0, 10).map((variant) => ({
              id: variant.assetId ?? "",
              name: variant.name || variant.subject || "Unnamed asset",
              variety: variant.variety ?? "",
              language: variant.language ?? "",
              price: variant.price ? `$${(variant.price / 100).toFixed(0)}` : "—",
            }))
          );
        }
      } else if (formData.priceSource === "TCGplayer") {
        const tcgQuery = [formData.cardName, formData.set, formData.tcg].filter(Boolean).join(" ");
        const res = await fetch(`/api/oracle?endpoint=tcgplayer-search&q=${encodeURIComponent(tcgQuery)}`);
        if (res.ok) {
          const data: TcgPlayerSearchResponse = await res.json();
          const results = data.results ?? [];
          setSearchResults(
            results.slice(0, 10).map((result) => ({
              id: result.productId?.toString() ?? "",
              name: result.name ?? "Unnamed product",
              variety: result.printingType || result.variant || "",
              language: "",
              price: result.marketPrice ? `$${result.marketPrice.toFixed(2)}` : "—",
            }))
          );
        }
      }
    } catch (error) {
      console.error("Price source search failed:", error);
    }
    setSearching(false);
  };

  const selectPriceSource = (result: PriceSearchResult) => {
    setFormData(prev => ({
      ...prev,
      priceSourceId: result.id,
      priceSourceName: `${result.name} ${result.variety ? `[${result.variety}]` : ""} ${result.price}`.trim(),
    }));
    setSearchResults([]);
  };

  const handleImageUpload = (field: ImageField) => (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = () => {
        const previewField: PreviewField = field === 'frontImage' ? 'frontImagePreview' : 'backImagePreview';
        setFormData(prev => ({ ...prev, [field]: file, [previewField]: reader.result as string }));
      };
      reader.readAsDataURL(file);
    }
  };

  const generateMetadata = (imageUri?: string, imageMimeType?: string) => {
    const attributes: Array<{ trait_type: string; value: string }> = [];
    if (formData.type === "Card") {
      attributes.push(
        { trait_type: "Type", value: "Card" }, { trait_type: "TCG", value: formData.tcg }, { trait_type: "Card Name", value: formData.cardName },
        { trait_type: "Set", value: formData.set }, { trait_type: "Card Number", value: formData.cardNumber },
        { trait_type: "Year", value: formData.year?.toString() || "" }, { trait_type: "Language", value: formData.language },
        { trait_type: "Variant", value: formData.variant }, { trait_type: "Condition", value: formData.condition }
      );
      if (formData.condition === "Graded") {
        attributes.push(
          { trait_type: "Grading Company", value: formData.gradingCompany }, { trait_type: "Grade", value: formData.grade },
          { trait_type: "Grade Label", value: formData.gradeLabel }, { trait_type: "Cert Number", value: formData.certNumber }
        );
      }
    } else {
      attributes.push(
        { trait_type: "Type", value: "Sealed" }, { trait_type: "Product Name", value: formData.productName },
        { trait_type: "Set", value: formData.sealedSet }, { trait_type: "Year", value: formData.sealedYear?.toString() || "" },
        { trait_type: "Language", value: formData.sealedLanguage }, { trait_type: "TCG", value: formData.sealedTcg }
      );
    }
    // Price source mapping
    if (formData.priceSource !== "None" && formData.priceSourceId) {
      attributes.push(
        { trait_type: "Price Source", value: formData.priceSource },
        { trait_type: "Price Source ID", value: formData.priceSourceId }
      );
    }

    return buildMetaplexCompatibleMetadata({
      name: mintName.canonicalName,
      symbol: DEFAULT_NFT_SYMBOL,
      description: `${formData.type} listed on Artifacte`,
      image: imageUri || "",
      imageMimeType,
      attributes,
      creatorAddress: TREASURY_WALLET,
      externalUrl: "https://artifacte.io",
      sellerFeeBasisPoints: ADMIN_CORE_ROYALTY_BASIS_POINTS,
    });
  };

  const wallet = useWallet();
  const { connection } = useConnection();
  const walletAddress = wallet.publicKey?.toBase58() || "";
  const [minting, setMinting] = useState(false);
  const [mintResult, setMintResult] = useState<string | null>(null);
  const [collectionAddress, setCollectionAddress] = useState(ARTIFACTE_COLLECTION || "");
  const [creatingCollection, setCreatingCollection] = useState(false);
  const [updatingCollectionRoyalty, setUpdatingCollectionRoyalty] = useState(false);
  const [collectionAccess, setCollectionAccess] = useState<CollectionAccessState>({
    checking: false,
    canUse: null,
    message: null,
    royaltyBasisPoints: null,
    updateAuthority: null,
  });
  const normalizedCollectionAddress = collectionAddress.trim();
  const collectionAuthorityLabel = normalizedCollectionAddress
    ? collectionAccess.checking
      ? "Resolving authority..."
      : collectionAccess.updateAuthority || "Authority unavailable"
    : "No collection selected";
  const collectionAccessLabel = !normalizedCollectionAddress
    ? "Standalone Mint"
    : collectionAccess.checking
      ? "Checking"
      : collectionAccess.canUse
        ? "Authorized"
        : "Blocked";
  const collectionAccessTone = !normalizedCollectionAddress
    ? "border-sky-500/30 bg-sky-500/10 text-sky-300"
    : collectionAccess.checking
      ? "border-gray-500/30 bg-gray-500/10 text-gray-300"
      : collectionAccess.canUse
        ? "border-green-500/30 bg-green-500/10 text-green-300"
        : "border-red-500/30 bg-red-500/10 text-red-300";
  const collectionAccessSummary = !normalizedCollectionAddress
    ? "No collection selected. This mint will be created as a standalone Metaplex Core asset."
    : collectionAccess.message || "Checking collection authority...";
  const collectionRoyaltyLabel = collectionAccess.royaltyBasisPoints == null
    ? "No Royalties plugin found"
    : formatRoyaltyBasisPoints(collectionAccess.royaltyBasisPoints);
  const collectionRoyaltyNeedsUpdate = collectionAccess.royaltyBasisPoints !== ADMIN_CORE_ROYALTY_BASIS_POINTS;

  useEffect(() => {
    let cancelled = false;

    async function checkCollectionAccess() {
      if (!walletAddress || !collectionAddress.trim()) {
        setCollectionAccess({
          checking: false,
          canUse: null,
          message: null,
          royaltyBasisPoints: null,
          updateAuthority: null,
        });
        return;
      }

      setCollectionAccess({
        checking: true,
        canUse: null,
        message: "Checking collection authority...",
        royaltyBasisPoints: null,
        updateAuthority: null,
      });

      const result = await validateCollectionAccess(connection.rpcEndpoint, collectionAddress, walletAddress);
      if (cancelled) {
        return;
      }

      setCollectionAccess({
        checking: false,
        canUse: result.canUse,
        message: result.message,
        royaltyBasisPoints: result.royaltyBasisPoints ?? null,
        updateAuthority: result.updateAuthority || null,
      });
    }

    void checkCollectionAccess();

    return () => {
      cancelled = true;
    };
  }, [walletAddress, collectionAddress, connection.rpcEndpoint]);

  const handleUpdateCollectionRoyalty = async () => {
    if (!wallet.publicKey || !wallet.signTransaction) return;

    const normalizedAddress = collectionAddress.trim();
    if (!normalizedAddress) {
      setMintResult("❌ Enter a Metaplex Core collection address first");
      return;
    }

    setUpdatingCollectionRoyalty(true);
    setMintResult(null);

    try {
      const collectionValidation = await validateCollectionAccess(connection.rpcEndpoint, normalizedAddress, walletAddress);
      if (!collectionValidation.canUse) {
        setMintResult(`❌ ${collectionValidation.message}`);
        return;
      }

      if (collectionValidation.royaltyBasisPoints === ADMIN_CORE_ROYALTY_BASIS_POINTS) {
        setMintResult(`✅ Collection royalty already set to ${formatRoyaltyBasisPoints(ADMIN_CORE_ROYALTY_BASIS_POINTS)}.\nCollection: ${collectionValidation.normalizedAddress}`);
        setCollectionAccess({
          checking: false,
          canUse: collectionValidation.canUse,
          message: collectionValidation.message,
          royaltyBasisPoints: collectionValidation.royaltyBasisPoints ?? null,
          updateAuthority: collectionValidation.updateAuthority || null,
        });
        return;
      }

      const currentRoyaltyLabel = collectionValidation.royaltyBasisPoints == null
        ? "not set"
        : formatRoyaltyBasisPoints(collectionValidation.royaltyBasisPoints);
      const umi = createUmi(connection).use(walletAdapterIdentity(wallet));
      const collection = await fetchCollection(umi, collectionValidation.normalizedAddress);
      const royaltiesPlugin = {
        type: "Royalties" as const,
        basisPoints: ADMIN_CORE_ROYALTY_BASIS_POINTS,
        creators: collection.royalties?.creators ?? [{ address: umiPublicKey(TREASURY_WALLET), percentage: 100 }],
        ruleSet: collection.royalties?.ruleSet ?? ruleSet("None"),
      };
      const builder = collectionValidation.royaltyBasisPoints == null
        ? addCollectionPlugin(umi, {
            collection: umiPublicKey(collectionValidation.normalizedAddress),
            plugin: royaltiesPlugin,
          })
        : updateCollectionPlugin(umi, {
            collection: umiPublicKey(collectionValidation.normalizedAddress),
            plugin: royaltiesPlugin,
          });

      setMintResult(
        `⏳ Requesting signature to update collection royalties...\nCollection: ${collectionValidation.normalizedAddress}\nCurrent royalty: ${currentRoyaltyLabel}\nTarget royalty: ${formatRoyaltyBasisPoints(ADMIN_CORE_ROYALTY_BASIS_POINTS)}`
      );

      const txSignature = await requestSignatureAndSendFromFrontend(builder, umi, connection);
      const refreshedValidation = await validateCollectionAccess(connection.rpcEndpoint, collectionValidation.normalizedAddress, walletAddress);

      setCollectionAccess({
        checking: false,
        canUse: refreshedValidation.canUse,
        message: refreshedValidation.message,
        royaltyBasisPoints: refreshedValidation.royaltyBasisPoints ?? ADMIN_CORE_ROYALTY_BASIS_POINTS,
        updateAuthority: refreshedValidation.updateAuthority || collectionValidation.updateAuthority || null,
      });
      setMintResult(
        `✅ Collection royalties updated to ${formatRoyaltyBasisPoints(ADMIN_CORE_ROYALTY_BASIS_POINTS)}.\nCollection: ${collectionValidation.normalizedAddress}\nPrevious royalty: ${currentRoyaltyLabel}\nTx: ${txSignature}`
      );
    } catch (error) {
      let logs: string[] | undefined;
      if (error instanceof SendTransactionError) {
        try {
          logs = await error.getLogs(connection);
        } catch {
          logs = error.logs;
        }
      } else if (error instanceof Error && Array.isArray((error as ErrorWithLogs).logs)) {
        logs = (error as ErrorWithLogs).logs;
      }

      const nextError = error instanceof Error ? error : new Error("Collection royalty update failed");
      const logSuffix = logs && logs.length > 0 ? `\n\nLogs:\n${logs.slice(-10).join("\n")}` : "";
      setMintResult(`❌ Error: ${nextError.message}${logSuffix}`);
      console.error("Collection royalty update error:", error);
    } finally {
      setUpdatingCollectionRoyalty(false);
    }
  };

  const handleCreateCollection = async () => {
    if (!wallet.publicKey || !wallet.signTransaction) return;
    setCreatingCollection(true);
    setMintResult(null);
    try {
      const umi = createUmi(connection)
        .use(walletAdapterIdentity(wallet))
        .use(irysUploader());

      const collectionMeta = {
        ...buildMetaplexCompatibleMetadata({
          name: "Artifacte",
          symbol: DEFAULT_COLLECTION_SYMBOL,
          description: "Artifacte — RWA tokenized collectibles on Solana. Trading cards, sealed products, and more.",
          image: "",
          creatorAddress: TREASURY_WALLET,
          externalUrl: "https://artifacte.io",
          sellerFeeBasisPoints: ADMIN_CORE_ROYALTY_BASIS_POINTS,
        }),
      };

      setMintResult("⏳ Uploading collection metadata...");
      const metadataUri = await umi.uploader.uploadJson(collectionMeta);
      const collectionUriStatus = getMetadataFieldStatus(metadataUri, METADATA_BYTE_LIMITS.uri, "uri");
      if (!collectionUriStatus.fits) {
        setMintResult(`❌ Collection metadata URI too long (${collectionUriStatus.bytes} bytes, max ${METADATA_BYTE_LIMITS.uri})`);
        setCreatingCollection(false);
        return;
      }

      setMintResult("⏳ Creating collection on-chain...");
      const collection = generateSigner(umi);

      const txSignature = await requestSignatureAndSendFromFrontend(createCollectionV1(umi, {
        collection,
        name: "Artifacte",
        uri: metadataUri,
        plugins: [
          pluginAuthorityPair({
            type: "Royalties",
            data: {
              basisPoints: ADMIN_CORE_ROYALTY_BASIS_POINTS,
              creators: [{ address: umiPublicKey(TREASURY_WALLET), percentage: 100 }],
              ruleSet: ruleSet("None"),
            },
          }),
        ],
      }), umi, connection);

      setCollectionAddress(collection.publicKey.toString());
      setMintResult(`✅ Collection created!\nAddress: ${collection.publicKey}\nTx: ${txSignature}\n\nSave this address!`);
    } catch (error) {
      const nextError = error instanceof Error ? error : new Error("Collection creation failed");
      setMintResult(`❌ Error: ${nextError.message}`);
    }
    setCreatingCollection(false);
  };

  const handleMint = async () => {
    if (!wallet.publicKey || !wallet.signTransaction) return;
    const canonicalName = buildCanonicalMintName(formData);
    
    // Input validation
    if (formData.recipientWallet) {
      try {
        umiPublicKey(formData.recipientWallet);
      } catch {
        setMintResult("❌ Invalid recipient wallet address");
        return;
      }
    }
    if (!canonicalName.canonicalName || !canonicalName.fits) {
      setMintResult(`❌ Name must fit within ${METADATA_BYTE_LIMITS.name} UTF-8 bytes on-chain`);
      return;
    }
    if (!symbolStatus.fits) {
      setMintResult(`❌ Symbol must fit within ${METADATA_BYTE_LIMITS.symbol} UTF-8 bytes`);
      return;
    }

    setMinting(true);
    setMintResult(null);
    try {
      // Step 1: Set up Umi with Irys uploader
      const umi = createUmi(connection)
        .use(walletAdapterIdentity(wallet))
        .use(irysUploader());

      let validatedCollectionAddress = "";
      if (collectionAddress.trim()) {
        const collectionValidation = await validateCollectionAccess(connection.rpcEndpoint, collectionAddress, walletAddress);
        if (!collectionValidation.canUse) {
          setMintResult(`❌ ${collectionValidation.message}`);
          setMinting(false);
          return;
        }

        validatedCollectionAddress = collectionValidation.normalizedAddress;
      }

      // Step 2: Upload image to Arweave FIRST — always required
      let imageUri = "";
      if (!formData.frontImage) {
        setMintResult("❌ Front image is required before minting");
        setMinting(false);
        return;
      }
      setMintResult("⏳ Uploading image to Arweave...");
      const arrayBuffer = await formData.frontImage.arrayBuffer();
      const uploadFile: Parameters<typeof umi.uploader.upload>[0][number] = {
        buffer: new Uint8Array(arrayBuffer),
        contentType: formData.frontImage.type,
        displayName: formData.frontImage.name,
        extension: formData.frontImage.name.split(".").pop() || "jpg",
        fileName: formData.frontImage.name,
        tags: [],
        uniqueName: `artifacte-${Date.now()}`,
      };
      const [imgUri] = await umi.uploader.upload([uploadFile]);
      imageUri = imgUri;
      if (!imageUri || !imageUri.startsWith('http')) {
        setMintResult("❌ Image upload failed — got invalid URI: " + imageUri);
        setMinting(false);
        return;
      }

      // Step 3: Build metadata with the real image URL (never embed base64)
      const metadata = generateMetadata(imageUri, formData.frontImage.type);

      // Validate metadata size
      const metaSize = getUtf8ByteLength(JSON.stringify(metadata));
      if (metaSize > 50000) {
        setMintResult("❌ Metadata too large (" + metaSize + " bytes, max 50KB)");
        setMinting(false);
        return;
      }

      // Step 4: Upload metadata JSON to Arweave
      setMintResult("⏳ Uploading metadata to Arweave...");
      const metadataUri = await umi.uploader.uploadJson(metadata);
      const metadataUriStatus = getMetadataFieldStatus(metadataUri, METADATA_BYTE_LIMITS.uri, "uri");
      if (!metadataUriStatus.fits) {
        setMintResult(`❌ Metadata URI too long (${metadataUriStatus.bytes} bytes, max ${METADATA_BYTE_LIMITS.uri})`);
        setMinting(false);
        return;
      }

      // Step 4: Create Metaplex Core asset with royalties
      setMintResult("⏳ Simulating transaction...");
      const asset = generateSigner(umi);

      const createArgs = {
        asset,
        name: canonicalName.canonicalName,
        uri: metadataUri,
        owner: formData.recipientWallet ? umiPublicKey(formData.recipientWallet) : umi.identity.publicKey,
        plugins: [
          pluginAuthorityPair({
            type: "Royalties",
            data: {
              basisPoints: ADMIN_CORE_ROYALTY_BASIS_POINTS,
              creators: [{ address: umiPublicKey(TREASURY_WALLET), percentage: 100 }],
              ruleSet: ruleSet("None"),
            },
          }),
        ],
        ...(validatedCollectionAddress
          ? { collection: umiPublicKey(validatedCollectionAddress) }
          : {}),
      };

      const txSignature = await requestSignatureAndSendFromFrontend(createV1(umi, createArgs), umi, connection);

      setMintResult(`✅ Minted!\n\nAsset: ${asset.publicKey}\nMetadata: ${metadataUri}\nImage: ${imageUri || "none"}\nTx: ${txSignature}`);
    } catch (error) {
      let logs: string[] | undefined;
      if (error instanceof SendTransactionError) {
        try {
          logs = await error.getLogs(connection);
        } catch {
          logs = error.logs;
        }
      } else if (error instanceof Error && Array.isArray((error as ErrorWithLogs).logs)) {
        logs = (error as ErrorWithLogs).logs;
      }

      const nextError = error instanceof Error ? error : new Error("Mint failed");
      const hasCollectionApprovalError = /Neither the asset or any plugins have approved this operation|0x1a/.test(nextError.message);
      const logSuffix = logs && logs.length > 0 ? `\n\nLogs:\n${logs.slice(-10).join("\n")}` : "";

      if (hasCollectionApprovalError && collectionAddress.trim()) {
        const authorityHint = collectionAccess.updateAuthority
          ? ` Selected collection authority: ${collectionAccess.updateAuthority}.`
          : "";
        setMintResult(`❌ The selected collection rejected this mint.${authorityHint} Clear the collection field to mint standalone, create a new collection with this wallet, or switch to the collection authority wallet.${logSuffix}`);
      } else {
        setMintResult(`❌ Error: ${nextError.message}${logSuffix}`);
      }
      console.error("Mint error:", error);
    }
    setMinting(false);
  };

  // Reuse the same JSX but without the page wrapper
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
      {/* Form */}
      <div className="bg-dark-800 border border-white/10 rounded-xl p-8">
        <h3 className="font-serif text-xl font-bold text-white mb-6">Mint New NFT</h3>
        <p className="mb-6 rounded-lg border border-gold-500/20 bg-gold-500/10 px-4 py-3 text-sm text-gold-300">
          Admin mints use a fixed {ADMIN_CORE_ROYALTY_BASIS_POINTS / 100}% secondary royalty.
        </p>
        
        {/* Collection */}
        <div className="mb-6 p-4 bg-dark-700 rounded-lg border border-white/5">
          <h4 className="text-gold-400 font-semibold mb-2">Collection</h4>
          <div className="flex gap-2 mb-2">
            <input type="text" value={collectionAddress} onChange={(e) => setCollectionAddress(e.target.value)} className="flex-1 bg-dark-900 border border-white/10 rounded-lg px-3 py-2 text-white text-xs font-mono focus:outline-hidden focus:border-gold-500" placeholder="Collection address (create one first)" />
          </div>
          <div className="mb-3 rounded-lg border border-white/10 bg-dark-800/70 p-3">
            <div className="flex items-start justify-between gap-3 mb-2">
              <div>
                <p className="text-[11px] uppercase tracking-[0.18em] text-gray-500">Collection Authority</p>
                <p className="mt-1 text-xs font-mono text-white break-all">{collectionAuthorityLabel}</p>
              </div>
              <span className={`inline-flex shrink-0 items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] ${collectionAccessTone}`}>
                {collectionAccessLabel}
              </span>
            </div>
            <div className="space-y-1 text-xs">
              <p className="text-gray-500 break-all">
                Connected wallet: <span className="font-mono text-gray-300">{walletAddress || "Connect wallet"}</span>
              </p>
              {normalizedCollectionAddress && (
                <>
                  <p className="text-gray-500 break-all">
                    Collection: <span className="font-mono text-gray-300">{normalizedCollectionAddress}</span>
                  </p>
                  <p className="text-gray-500 break-all">
                    Current royalty: <span className="font-mono text-gray-300">{collectionRoyaltyLabel}</span>
                    <span className="ml-2 text-gray-500">Target {formatRoyaltyBasisPoints(ADMIN_CORE_ROYALTY_BASIS_POINTS)}</span>
                  </p>
                </>
              )}
              <p className={`${collectionAccess.checking ? "text-gray-400" : collectionAccess.canUse === false ? "text-amber-400" : "text-gray-400"}`}>
                {collectionAccessSummary}
              </p>
            </div>
            {collectionAccess.canUse === false && (
              <button
                type="button"
                onClick={() => setCollectionAddress("")}
                className="mt-2 text-xs text-gold-400 hover:text-gold-300 transition"
              >
                Clear collection and mint standalone
              </button>
            )}
          </div>
          {!collectionAddress && (
            <button onClick={handleCreateCollection} disabled={creatingCollection} className={`w-full py-2 rounded-lg text-xs font-medium transition ${creatingCollection ? "bg-gray-700 text-gray-500" : "bg-gold-500/20 border border-gold-500/50 text-gold-400 hover:bg-gold-500/30"}`}>
              {creatingCollection ? "Creating..." : "Create Artifacte Collection (one-time)"}
            </button>
          )}
          {collectionAddress && collectionAccess.canUse === true && (
            <div className="space-y-2">
              <p className="text-green-400 text-xs">✅ Collection set and authorized</p>
              {collectionRoyaltyNeedsUpdate ? (
                <button
                  type="button"
                  onClick={handleUpdateCollectionRoyalty}
                  disabled={updatingCollectionRoyalty}
                  className={`w-full py-2 rounded-lg text-xs font-medium transition ${updatingCollectionRoyalty ? "bg-gray-700 text-gray-500" : "bg-gold-500/20 border border-gold-500/50 text-gold-400 hover:bg-gold-500/30"}`}
                >
                  {updatingCollectionRoyalty
                    ? `Updating royalty to ${formatRoyaltyBasisPoints(ADMIN_CORE_ROYALTY_BASIS_POINTS)}...`
                    : `Update collection royalty to ${formatRoyaltyBasisPoints(ADMIN_CORE_ROYALTY_BASIS_POINTS)}`}
                </button>
              ) : (
                <p className="text-xs text-gray-400">
                  Collection royalty already matches the admin target of {formatRoyaltyBasisPoints(ADMIN_CORE_ROYALTY_BASIS_POINTS)}.
                </p>
              )}
            </div>
          )}
        </div>

        {/* Basic Info */}
        <div className="mb-6">
          <h4 className="text-gold-400 font-semibold mb-3">Basic Info</h4>
          <div className="grid grid-cols-2 gap-4 mb-3">
            <div>
              <label className="block text-sm text-gray-400 mb-1">Type</label>
              <select value={formData.type} onChange={(e) => setFormData(prev => ({ ...prev, type: e.target.value as MintFormData["type"] }))} className="w-full bg-dark-900 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-hidden focus:border-gold-500">
                <option value="Card">Card</option><option value="Sealed Product">Sealed Product</option>
              </select>
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1">TCG</label>
              <select value={formData.tcg} onChange={(e) => setFormData(prev => ({ ...prev, tcg: e.target.value as MintFormData["tcg"] }))} className="w-full bg-dark-900 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-hidden focus:border-gold-500">
                <option value="Pokemon">Pokemon</option><option value="One Piece">One Piece</option><option value="Dragon Ball">Dragon Ball</option><option value="Yu-Gi-Oh">Yu-Gi-Oh</option><option value="Sports">Sports</option><option value="Other">Other</option>
              </select>
            </div>
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-1">On-Chain Name</label>
            <input type="text" value={mintName.canonicalName} readOnly className="w-full bg-dark-700 border border-white/10 rounded-lg px-3 py-2 text-gray-300 text-sm cursor-not-allowed" />
            <div className="mt-2 space-y-1 text-xs">
              <p className={nameStatus.fits ? "text-gray-400" : "text-red-400"}>
                {nameStatus.bytes}/{METADATA_BYTE_LIMITS.name} bytes on-chain
                {mintName.wasShortened ? " • auto-shortened to fit" : ""}
              </p>
              {mintName.wasShortened && mintName.sourceName && (
                <p className="text-amber-400 wrap-break-word">Source name: {mintName.sourceName}</p>
              )}
              {nameUsesMultibyte && (
                <p className="text-gray-500">UTF-8 aware: emoji and accented characters consume multiple bytes.</p>
              )}
              <p className={symbolStatus.fits ? "text-gray-500" : "text-red-400"}>
                Symbol {DEFAULT_NFT_SYMBOL}: {symbolStatus.bytes}/{METADATA_BYTE_LIMITS.symbol} bytes
              </p>
            </div>
          </div>
        </div>
        {/* Card Details */}
        {formData.type === "Card" && (
          <div className="mb-6">
            <h4 className="text-gold-400 font-semibold mb-3">Card Details</h4>
            <div className="mb-3"><label className="block text-sm text-gray-400 mb-1">Card Name</label><input type="text" value={formData.cardName} onChange={(e) => setFormData(prev => ({ ...prev, cardName: e.target.value }))} className="w-full bg-dark-900 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-hidden focus:border-gold-500" placeholder="e.g. Monkey D. Luffy" /></div>
            <div className="grid grid-cols-2 gap-3 mb-3">
              <div><label className="block text-sm text-gray-400 mb-1">Set</label><input type="text" value={formData.set} onChange={(e) => setFormData(prev => ({ ...prev, set: e.target.value }))} className="w-full bg-dark-900 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-hidden focus:border-gold-500" placeholder="e.g. OP09" /></div>
              <div><label className="block text-sm text-gray-400 mb-1">Card Number</label><input type="text" value={formData.cardNumber} onChange={(e) => setFormData(prev => ({ ...prev, cardNumber: e.target.value }))} className="w-full bg-dark-900 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-hidden focus:border-gold-500" placeholder="e.g. 051" /></div>
            </div>
            <div className="grid grid-cols-2 gap-3 mb-3">
              <div><label className="block text-sm text-gray-400 mb-1">Year</label><input type="number" value={formData.year} onChange={(e) => setFormData(prev => ({ ...prev, year: e.target.value ? parseInt(e.target.value) : "" }))} className="w-full bg-dark-900 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-hidden focus:border-gold-500" /></div>
              <div><label className="block text-sm text-gray-400 mb-1">Language</label><select value={formData.language} onChange={(e) => setFormData(prev => ({ ...prev, language: e.target.value as MintFormData["language"] }))} className="w-full bg-dark-900 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-hidden focus:border-gold-500"><option value="English">English</option><option value="Japanese">Japanese</option><option value="Chinese">Chinese</option><option value="Korean">Korean</option><option value="French">French</option><option value="German">German</option></select></div>
            </div>
            <div className="grid grid-cols-2 gap-3 mb-3">
              <div><label className="block text-sm text-gray-400 mb-1">Variant</label><input type="text" value={formData.variant} onChange={(e) => setFormData(prev => ({ ...prev, variant: e.target.value }))} className="w-full bg-dark-900 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-hidden focus:border-gold-500" placeholder="e.g. Manga Alternate Art" /></div>
              <div><label className="block text-sm text-gray-400 mb-1">Condition</label><select value={formData.condition} onChange={(e) => setFormData(prev => ({ ...prev, condition: e.target.value as MintFormData["condition"] }))} className="w-full bg-dark-900 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-hidden focus:border-gold-500"><option value="Graded">Graded</option><option value="Near Mint">Near Mint</option><option value="Lightly Played">Lightly Played</option><option value="Moderately Played">Moderately Played</option><option value="Heavily Played">Heavily Played</option></select></div>
            </div>
            {formData.condition === "Graded" && (
              <div className="bg-dark-700 rounded-lg p-4 border border-white/5">
                <h5 className="text-gold-400 font-medium mb-2 text-sm">Grading Details</h5>
                <div className="grid grid-cols-2 gap-3 mb-3">
                  <div><label className="block text-xs text-gray-400 mb-1">Company</label><select value={formData.gradingCompany} onChange={(e) => setFormData(prev => ({ ...prev, gradingCompany: e.target.value as MintFormData["gradingCompany"] }))} className="w-full bg-dark-800 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-hidden focus:border-gold-500"><option value="PSA">PSA</option><option value="BGS">BGS</option><option value="CGC">CGC</option></select></div>
                  <div><label className="block text-xs text-gray-400 mb-1">Grade</label><input type="text" value={formData.grade} onChange={(e) => setFormData(prev => ({ ...prev, grade: e.target.value }))} className="w-full bg-dark-800 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-hidden focus:border-gold-500" placeholder="10" /></div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div><label className="block text-xs text-gray-400 mb-1">Label</label><input type="text" value={formData.gradeLabel} onChange={(e) => setFormData(prev => ({ ...prev, gradeLabel: e.target.value }))} className="w-full bg-dark-800 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-hidden focus:border-gold-500" placeholder="GEM-MT" /></div>
                  <div><label className="block text-xs text-gray-400 mb-1">Cert #</label><input type="text" value={formData.certNumber} onChange={(e) => setFormData(prev => ({ ...prev, certNumber: e.target.value }))} className="w-full bg-dark-800 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-hidden focus:border-gold-500" /></div>
                </div>
              </div>
            )}
          </div>
        )}
        {/* Sealed Details */}
        {formData.type === "Sealed Product" && (
          <div className="mb-6">
            <h4 className="text-gold-400 font-semibold mb-3">Sealed Product Details</h4>
            <div className="mb-3"><label className="block text-sm text-gray-400 mb-1">Product Name</label><input type="text" value={formData.productName} onChange={(e) => setFormData(prev => ({ ...prev, productName: e.target.value }))} className="w-full bg-dark-900 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-hidden focus:border-gold-500" placeholder="e.g. Booster Box" /></div>
            <div className="grid grid-cols-2 gap-3 mb-3">
              <div><label className="block text-sm text-gray-400 mb-1">Set</label><input type="text" value={formData.sealedSet} onChange={(e) => setFormData(prev => ({ ...prev, sealedSet: e.target.value }))} className="w-full bg-dark-900 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-hidden focus:border-gold-500" /></div>
              <div><label className="block text-sm text-gray-400 mb-1">Year</label><input type="number" value={formData.sealedYear} onChange={(e) => setFormData(prev => ({ ...prev, sealedYear: e.target.value ? parseInt(e.target.value) : "" }))} className="w-full bg-dark-900 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-hidden focus:border-gold-500" /></div>
            </div>
          </div>
        )}

        {/* Price Source */}
        <div className="mb-6">
          <h4 className="text-gold-400 font-semibold mb-3">Price Source</h4>
          <div className="grid grid-cols-2 gap-3 mb-3">
            <div>
              <label className="block text-sm text-gray-400 mb-1">Source</label>
              <select value={formData.priceSource} onChange={(e) => setFormData(prev => ({ ...prev, priceSource: e.target.value as MintFormData["priceSource"], priceSourceId: "", priceSourceName: "" }))} className="w-full bg-dark-900 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-hidden focus:border-gold-500">
                <option value="Alt.xyz">Alt.xyz (Graded)</option>
                <option value="TCGplayer">TCGplayer (Ungraded/Sealed)</option>
                <option value="None">None</option>
              </select>
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1">Source ID</label>
              <input type="text" value={formData.priceSourceId} onChange={(e) => setFormData(prev => ({ ...prev, priceSourceId: e.target.value }))} className="w-full bg-dark-900 border border-white/10 rounded-lg px-3 py-2 text-white text-sm font-mono focus:outline-hidden focus:border-gold-500" placeholder="Auto-filled from search" />
            </div>
          </div>
          {formData.priceSourceName && (
            <div className="mb-3 px-3 py-2 bg-green-900/20 border border-green-700/30 rounded-lg text-green-400 text-xs">✅ {formData.priceSourceName}</div>
          )}
          {formData.priceSource !== "None" && (
            <button type="button" onClick={handlePriceSourceSearch} disabled={searching || !formData.cardName} className={`w-full py-2 rounded-lg text-sm font-medium transition ${searching || !formData.cardName ? "bg-gray-700 text-gray-500 cursor-not-allowed" : "bg-dark-700 border border-gold-500/50 text-gold-400 hover:bg-dark-600"}`}>
              {searching ? "Searching..." : `Search ${formData.priceSource}`}
            </button>
          )}
          {searchResults.length > 0 && (
            <div className="mt-3 border border-white/10 rounded-lg overflow-hidden max-h-60 overflow-y-auto">
              {searchResults.map((r, i) => (
                <button key={i} onClick={() => selectPriceSource(r)} className="w-full text-left px-3 py-2 hover:bg-dark-700 border-b border-white/5 last:border-0 transition">
                  <div className="text-white text-xs font-medium truncate">{r.name}</div>
                  <div className="text-gray-400 text-xs">{r.variety} {r.language ? `• ${r.language}` : ""} {r.price ? `• ${r.price}` : ""}</div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Images */}
        <div className="mb-6">
          <h4 className="text-gold-400 font-semibold mb-3">Images</h4>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm text-gray-400 mb-1">Front</label>
              <input type="file" accept="image/*" onChange={handleImageUpload('frontImage')} className="w-full bg-dark-900 border border-white/10 rounded-lg px-3 py-2 text-white text-xs focus:outline-hidden focus:border-gold-500 file:mr-2 file:py-1 file:px-2 file:rounded file:border-0 file:text-xs file:bg-gold-500 file:text-dark-900" />
              {formData.frontImagePreview && <PreviewImage alt="Front" src={formData.frontImagePreview} />}
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1">Back (Optional)</label>
              <input type="file" accept="image/*" onChange={handleImageUpload('backImage')} className="w-full bg-dark-900 border border-white/10 rounded-lg px-3 py-2 text-white text-xs focus:outline-hidden focus:border-gold-500 file:mr-2 file:py-1 file:px-2 file:rounded file:border-0 file:text-xs file:bg-gold-500 file:text-dark-900" />
              {formData.backImagePreview && <PreviewImage alt="Back" src={formData.backImagePreview} />}
            </div>
          </div>
        </div>
        {/* Recipient */}
        <div className="mb-6">
          <h4 className="text-gold-400 font-semibold mb-3">Recipient</h4>
          <input type="text" value={formData.recipientWallet} onChange={(e) => setFormData(prev => ({ ...prev, recipientWallet: e.target.value }))} className="w-full bg-dark-900 border border-white/10 rounded-lg px-3 py-2 text-white text-sm font-mono focus:outline-hidden focus:border-gold-500" placeholder="Solana wallet address" />
        </div>
        <button onClick={handleMint} disabled={!mintName.canonicalName || !formData.recipientWallet || minting} className={`w-full py-3 rounded-lg font-semibold text-sm transition ${!mintName.canonicalName || !formData.recipientWallet || minting ? "bg-gray-600 text-gray-400 cursor-not-allowed" : "bg-gold-500 hover:bg-gold-600 text-dark-900"}`}>{minting ? "Minting..." : "Mint NFT"}</button>
        {mintResult && (
          <div className={`mt-3 p-3 rounded-lg text-xs font-mono whitespace-pre-wrap ${mintResult.startsWith("✅") ? "bg-green-900/20 border border-green-700/30 text-green-400" : "bg-red-900/20 border border-red-700/30 text-red-400"}`}>{mintResult}</div>
        )}
      </div>
      {/* Metadata Preview */}
      <div className="bg-dark-800 border border-white/10 rounded-xl p-8">
        <h3 className="font-serif text-xl font-bold text-white mb-6">Metadata Preview</h3>
        <div className="bg-dark-700 rounded-lg p-4 border border-white/5 overflow-auto max-h-150">
          <pre className="text-gray-300 text-xs whitespace-pre-wrap">{JSON.stringify(generateMetadata(), null, 2)}</pre>
        </div>
      </div>
    </div>
  );
}