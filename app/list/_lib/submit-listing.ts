"use client";

import { createSolanaRpc, signature } from "@solana/kit";
import {
  createAssociatedTokenAccountInstruction,
  getAssociatedTokenAddress,
  TOKEN_2022_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import { PublicKey, Transaction, VersionedTransaction } from "@solana/web3.js";

import { AuctionProgram, ItemCategory, ListingType } from "@/lib/auction-program";
import type { AnchorWalletLike } from "@/hooks/useWalletCapabilities";

import { getAssetCategory, getAssetFlags } from "./assets";
import {
  LIST_PAGE_ARTIFACTE_AUTHORITY,
  LIST_PAGE_SOL_MINT,
  LIST_PAGE_USDC_MINT,
} from "./constants";
import type {
  ListPageAsset,
  ListPageListingMode,
  ListPageRoyaltyMetadata,
  ListPageTensorBuildResponse,
} from "./types";

const LIST_PAGE_RPC_PATH = "/api/rpc";
const LIST_PAGE_RPC = createSolanaRpc(LIST_PAGE_RPC_PATH);
const LIST_PAGE_PROGRAM_ID = new PublicKey("81s1tEx4MPdVvqS6X84Mok5K4N5fMbRLzcsT5eo2K8J3");
const LISTING_SEED = new TextEncoder().encode("listing");
type WireTransactionBase64 = Parameters<typeof LIST_PAGE_RPC.sendTransaction>[0];

type WalletSendTransaction = (
  transaction: Transaction,
  connection: Parameters<AuctionProgram["listCoreItem"]>[0] extends never ? never : import("@solana/web3.js").Connection,
) => Promise<string>;

interface RpcSignatureStatus {
  confirmationStatus?: "processed" | "confirmed" | "finalized" | null;
  err?: object | string | null;
}

interface TensorListBuildRequest {
  amount: number;
  currency?: "USDC";
  mint: string;
  owner: string;
}

interface ListPageNotifier {
  info: (message: string) => void;
}

export interface SubmitListPageListingArgs {
  anchorWallet: AnchorWalletLike | null;
  auctionDuration: string;
  connection: import("@solana/web3.js").Connection;
  listingType: ListPageListingMode;
  notifier: ListPageNotifier;
  price: string;
  publicKey: PublicKey | null;
  royaltyMetadata?: ListPageRoyaltyMetadata;
  selectedAsset: ListPageAsset | null;
  sendTransaction?: WalletSendTransaction;
  signTransaction?: AnchorWalletLike["signTransaction"];
}

export interface SubmitListPageListingResult {
  mintAddress: string;
  oracleNotifyDelayMs: number;
  shouldNotifyOracle: boolean;
  signature: string;
}

const ARTIFACTE_ORACLE_NOTIFY_DELAY_MS = 0;
const TENSOR_ORACLE_NOTIFY_DELAY_MS = 3000;

function decodeBase64Transaction(base64Transaction: string): Uint8Array {
  return Uint8Array.from(atob(base64Transaction), (character) => character.charCodeAt(0));
}

function encodeBase64Transaction(rawTransactionBytes: Uint8Array): string {
  let binary = "";
  const chunkSize = 0x8000;

  for (let offset = 0; offset < rawTransactionBytes.length; offset += chunkSize) {
    const chunk = rawTransactionBytes.subarray(offset, offset + chunkSize);

    for (let index = 0; index < chunk.length; index += 1) {
      binary += String.fromCharCode(chunk[index] ?? 0);
    }
  }

  return btoa(binary);
}

function toWireTransactionBase64(base64Transaction: string): WireTransactionBase64 {
  return base64Transaction as WireTransactionBase64;
}

function getPrimaryCreatorAddress(royaltyMetadata?: ListPageRoyaltyMetadata): PublicKey {
  const creatorAddress = royaltyMetadata?.creators.find((creator) => creator.address)?.address;
  return new PublicKey(creatorAddress ?? LIST_PAGE_ARTIFACTE_AUTHORITY);
}

function getRoyaltyBasisPoints(royaltyMetadata?: ListPageRoyaltyMetadata): number {
  const additionalMetadata = royaltyMetadata?.mintExtensions?.metadata?.additional_metadata ?? [];
  const additionalRoyaltyValue = additionalMetadata.find(([key]) => key === "royalty_basis_points")?.[1];

  if (additionalRoyaltyValue) {
    const parsedRoyalty = Number.parseInt(additionalRoyaltyValue, 10);
    if (Number.isFinite(parsedRoyalty)) {
      return parsedRoyalty;
    }
  }

  return royaltyMetadata?.royalty.basis_points ?? 0;
}

function getRuleSetAddress(royaltyMetadata?: ListPageRoyaltyMetadata): PublicKey | null {
  if (!royaltyMetadata?.ruleSetAddress) {
    return null;
  }

  return new PublicKey(royaltyMetadata.ruleSetAddress);
}

function getTensorListingRoute(isCompressed: boolean, isToken2022: boolean): string {
  if (isCompressed) {
    return "/api/tensor-list";
  }

  if (isToken2022) {
    return "/api/tensor-list-t22";
  }

  return "/api/tensor-list-legacy";
}

function getTensorListingCurrency(itemCategory: ItemCategory): "USDC" | undefined {
  return itemCategory === ItemCategory.DigitalArt ? undefined : "USDC";
}

function getListingType(mode: ListPageListingMode): ListingType {
  return mode === "fixed" ? ListingType.FixedPrice : ListingType.Auction;
}

function getDurationSeconds(mode: ListPageListingMode, auctionDuration: string): number | undefined {
  if (mode !== "auction") {
    return undefined;
  }

  return Math.round(Number.parseFloat(auctionDuration) * 3600);
}

function getPriceInUnits(price: string, itemCategory: ItemCategory): number {
  const parsedPrice = Number.parseFloat(price);

  if (!Number.isFinite(parsedPrice) || parsedPrice <= 0) {
    throw new Error("Enter a valid price greater than zero.");
  }

  return itemCategory === ItemCategory.DigitalArt
    ? Math.floor(parsedPrice * 1_000_000_000)
    : Math.floor(parsedPrice * 1_000_000);
}

function isCoreListingInstructionFallback(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  const rawLogs = (error as { logs?: unknown }).logs;
  const logs = Array.isArray(rawLogs)
    ? rawLogs.filter((entry): entry is string => typeof entry === "string")
    : [];

  return [error.message, ...logs].some(
    (line) =>
      line.includes("InstructionFallbackNotFound") ||
      line.includes("Fallback functions are not supported")
  );
}

function toCoreListingSubmissionError(error: unknown): Error {
  if (isCoreListingInstructionFallback(error)) {
    return new Error(
      "Artifacte Core listing is temporarily unavailable on mainnet. The deployed auction program rejected the Core listing instruction (list_core_item). Redeploy the current auction program binary, then try again."
    );
  }

  return error instanceof Error ? error : new Error("Listing failed.");
}

async function waitForListPageSignatureConfirmation(signatureValue: string): Promise<boolean> {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 1000));

    const statusResponse = await LIST_PAGE_RPC.getSignatureStatuses([signature(signatureValue)]).send();
    const status = (statusResponse.value[0] ?? null) as RpcSignatureStatus | null;

    if (status?.err) {
      throw new Error("Transaction failed on-chain.");
    }

    if (status?.confirmationStatus === "confirmed" || status?.confirmationStatus === "finalized") {
      return true;
    }
  }

  return false;
}

async function sendVersionedTransactionViaProxy(rawTransactionBytes: Uint8Array): Promise<string> {
  const encodedTransaction = encodeBase64Transaction(rawTransactionBytes);
  const signatureValue = await LIST_PAGE_RPC
    .sendTransaction(toWireTransactionBase64(encodedTransaction), {
      encoding: "base64",
      maxRetries: BigInt(5),
      skipPreflight: true,
    })
    .send();

  return `${signatureValue}`;
}

async function fetchTensorListingTransaction(
  route: string,
  request: TensorListBuildRequest
): Promise<ListPageTensorBuildResponse> {
  const response = await fetch(route, {
    body: JSON.stringify(request),
    headers: {
      "Content-Type": "application/json",
    },
    method: "POST",
  });

  const payload = (await response.json()) as ListPageTensorBuildResponse & { error?: string };

  if (!response.ok) {
    throw new Error(payload.error ?? "Failed to build Tensor listing transaction.");
  }

  return payload;
}

async function ensureSellerUsdcAccount(
  connection: import("@solana/web3.js").Connection,
  publicKey: PublicKey,
  sendTransaction: WalletSendTransaction | undefined,
  notifier: ListPageNotifier
): Promise<void> {
  const sellerUsdcAta = await getAssociatedTokenAddress(new PublicKey(LIST_PAGE_USDC_MINT), publicKey);
  const accountInfo = await connection.getAccountInfo(sellerUsdcAta, "confirmed");

  if (accountInfo) {
    return;
  }

  if (!sendTransaction) {
    throw new Error("Wallet does not support creating the required USDC account.");
  }

  notifier.info("Creating USDC account...");

  const createAtaInstruction = createAssociatedTokenAccountInstruction(
    publicKey,
    sellerUsdcAta,
    publicKey,
    new PublicKey(LIST_PAGE_USDC_MINT),
    TOKEN_PROGRAM_ID
  );

  const { blockhash } = await connection.getLatestBlockhash("confirmed");
  const transaction = new Transaction({ feePayer: publicKey, recentBlockhash: blockhash }).add(createAtaInstruction);
  const signatureValue = await sendTransaction(transaction, connection);
  await waitForListPageSignatureConfirmation(signatureValue);
}

export async function submitListPageListing({
  anchorWallet,
  auctionDuration,
  connection,
  listingType,
  notifier,
  price,
  publicKey,
  royaltyMetadata,
  selectedAsset,
  sendTransaction,
  signTransaction,
}: SubmitListPageListingArgs): Promise<SubmitListPageListingResult> {
  if (!selectedAsset || !publicKey || !anchorWallet) {
    throw new Error("Select an asset and connect a wallet before listing.");
  }

  const mintAddress = selectedAsset.nftAddress || selectedAsset.id;
  const nftMint = new PublicKey(mintAddress);
  const itemCategory = getAssetCategory(selectedAsset);
  const flags = getAssetFlags(selectedAsset);
  const paymentMint = new PublicKey(
    itemCategory === ItemCategory.DigitalArt ? LIST_PAGE_SOL_MINT : LIST_PAGE_USDC_MINT
  );
  const priceInUnits = getPriceInUnits(price, itemCategory);
  const durationSeconds = getDurationSeconds(listingType, auctionDuration);
  const mintAccountInfo = await connection.getAccountInfo(nftMint, "confirmed");
  const isToken2022 = mintAccountInfo?.owner.equals(TOKEN_2022_PROGRAM_ID) ?? false;
  const sellerNftAccount = await getAssociatedTokenAddress(
    nftMint,
    publicKey,
    false,
    isToken2022 ? TOKEN_2022_PROGRAM_ID : undefined
  );
  const auctionProgram = new AuctionProgram(connection, anchorWallet, sendTransaction);

  if (itemCategory !== ItemCategory.DigitalArt) {
    await ensureSellerUsdcAccount(connection, publicKey, sendTransaction, notifier);
  }

  if (flags.isCore) {
    if (listingType !== "fixed") {
      throw new Error("Auctions are not supported for Artifacte Core assets.");
    }

    const existingCoreListing = await auctionProgram.fetchCoreListing(nftMint);

    if (existingCoreListing) {
      const listingSeller = new PublicKey(existingCoreListing.seller);

      if (listingSeller.equals(publicKey)) {
        throw new Error("This Artifacte Core asset is already listed by your wallet.");
      }

      notifier.info("Closing stale Core listing...");
      await auctionProgram.closeStaleCoreListing(nftMint);
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }

    notifier.info("Listing on Artifacte (Core)...");

    const corePriceUsdc = Math.floor(Number.parseFloat(price) * 1_000_000);

    try {
      return {
        mintAddress,
        oracleNotifyDelayMs: ARTIFACTE_ORACLE_NOTIFY_DELAY_MS,
        shouldNotifyOracle: true,
        signature: await auctionProgram.listCoreItem(nftMint, corePriceUsdc),
      };
    } catch (error) {
      throw toCoreListingSubmissionError(error);
    }
  }

  const [listingPda] = PublicKey.findProgramAddressSync([LISTING_SEED, nftMint.toBytes()], LIST_PAGE_PROGRAM_ID);
  const existingListing = await connection.getAccountInfo(listingPda, "confirmed");

  if (existingListing) {
    notifier.info("Closing stale listing...");
    await auctionProgram.closeStaleListing(nftMint);
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }

  if (listingType === "fixed" && flags.isArtifacteAuthority) {
    notifier.info("Listing on Artifacte...");

    if (flags.isPnft) {
      return {
        mintAddress,
        oracleNotifyDelayMs: ARTIFACTE_ORACLE_NOTIFY_DELAY_MS,
        shouldNotifyOracle: true,
        signature: await auctionProgram.listItemPnft(
          nftMint,
          paymentMint,
          ListingType.FixedPrice,
          priceInUnits,
          undefined,
          itemCategory,
          getRoyaltyBasisPoints(royaltyMetadata) || 500,
          getPrimaryCreatorAddress(royaltyMetadata),
          getRuleSetAddress(royaltyMetadata)
        ),
      };
    }

    return {
      mintAddress,
      oracleNotifyDelayMs: ARTIFACTE_ORACLE_NOTIFY_DELAY_MS,
      shouldNotifyOracle: true,
      signature: await auctionProgram.listItem(
        nftMint,
        sellerNftAccount,
        paymentMint,
        ListingType.FixedPrice,
        priceInUnits,
        undefined,
        itemCategory
      ),
    };
  }

  if (listingType === "fixed") {
    if (!signTransaction) {
      throw new Error("Wallet does not support versioned transaction signing.");
    }

    notifier.info(
      flags.isCompressed
        ? "Listing compressed NFT on Tensor..."
        : isToken2022
          ? "Listing Token-2022 NFT on Tensor..."
          : "Listing NFT on Tensor..."
    );

    const tensorPayload = await fetchTensorListingTransaction(getTensorListingRoute(flags.isCompressed, isToken2022), {
      amount: priceInUnits,
      currency: getTensorListingCurrency(itemCategory),
      mint: mintAddress,
      owner: publicKey.toBase58(),
    });
    const transaction = VersionedTransaction.deserialize(decodeBase64Transaction(tensorPayload.tx));
    const signedTransaction = await signTransaction(transaction);
    const signatureValue = await sendVersionedTransactionViaProxy(signedTransaction.serialize());
    await waitForListPageSignatureConfirmation(signatureValue);

    return {
      mintAddress,
      oracleNotifyDelayMs: TENSOR_ORACLE_NOTIFY_DELAY_MS,
      shouldNotifyOracle: true,
      signature: signatureValue,
    };
  }

  if (flags.isCompressed) {
    throw new Error("Auctions are not available for compressed NFTs. Use Fixed Price instead.");
  }

  notifier.info(flags.isPnft ? "Listing pNFT auction on Artifacte..." : "Listing auction on Artifacte...");

  if (flags.isPnft) {
    return {
      mintAddress,
      oracleNotifyDelayMs: ARTIFACTE_ORACLE_NOTIFY_DELAY_MS,
      shouldNotifyOracle: false,
      signature: await auctionProgram.listItemPnft(
        nftMint,
        paymentMint,
        getListingType(listingType),
        priceInUnits,
        durationSeconds,
        itemCategory,
        getRoyaltyBasisPoints(royaltyMetadata) || 500,
        getPrimaryCreatorAddress(royaltyMetadata),
        getRuleSetAddress(royaltyMetadata)
      ),
    };
  }

  return {
    mintAddress,
    oracleNotifyDelayMs: ARTIFACTE_ORACLE_NOTIFY_DELAY_MS,
    shouldNotifyOracle: false,
    signature: await auctionProgram.listItem(
      nftMint,
      sellerNftAccount,
      paymentMint,
      getListingType(listingType),
      priceInUnits,
      durationSeconds,
      itemCategory
    ),
  };
}