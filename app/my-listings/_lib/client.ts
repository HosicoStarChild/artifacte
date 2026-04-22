import { createSolanaRpc, signature } from "@solana/kit";
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  createAssociatedTokenAccountInstruction,
  getAssociatedTokenAddress,
} from "@solana/spl-token";
import type { SendTransactionOptions } from "@solana/wallet-adapter-base";
import { Connection, PublicKey, Transaction, VersionedTransaction } from "@solana/web3.js";

import type { AnchorWalletLike } from "@/hooks/useWalletCapabilities";
import {
  isMyListingsPageData,
  type MyListingRecord,
  type MyListingsApiResponse,
  type MyListingsPageData,
  type MyListingStatus,
} from "@/lib/my-listings";
import { AuctionProgram } from "@/lib/auction-program";

const RPC_PROXY_PATH = "/api/rpc";
const myListingsRpc = createSolanaRpc(RPC_PROXY_PATH);

type WalletSendTransaction = (
  transaction: Transaction,
  connection: Connection,
  options?: SendTransactionOptions,
) => Promise<string>;

type WalletSignTransaction = AnchorWalletLike["signTransaction"];

type WireTransactionBase64 = Parameters<typeof myListingsRpc.sendTransaction>[0];

interface TensorDelistBuildResponse {
  kind: "compressed" | "legacy" | "t22";
  mint: string;
  tx: string;
}

interface RpcSignatureStatus {
  confirmationStatus?: "processed" | "confirmed" | "finalized" | null;
  err?: object | string | null;
}

export interface MyListingActionContext {
  anchorWallet: AnchorWalletLike | null;
  connection: Connection;
  sendTransaction?: WalletSendTransaction;
  signTransaction?: WalletSignTransaction;
  walletAddress: string;
}

export function getMyListingsQueryKey(walletAddress: string | null) {
  return ["my-listings", walletAddress] as const;
}

export async function fetchMyListings(walletAddress: string): Promise<MyListingsPageData> {
  const response = await fetch(
    `/api/my-listings?wallet=${encodeURIComponent(walletAddress)}`,
  );
  const payload = (await response.json()) as MyListingsApiResponse;

  if (!response.ok || !isMyListingsPageData(payload)) {
    throw new Error(
      isMyListingsPageData(payload)
        ? "Failed to fetch my listings"
        : payload.error,
    );
  }

  return payload;
}

export function updateCachedListingStatus(
  data: MyListingsPageData,
  nftMint: string,
  status: MyListingStatus,
): MyListingsPageData {
  return {
    ...data,
    listings: data.listings.map((listing) =>
      listing.nftMint === nftMint
        ? { ...listing, status }
        : listing,
    ),
    updatedAt: Date.now(),
  };
}

function toWireTransactionBase64(transaction: string): WireTransactionBase64 {
  return transaction as WireTransactionBase64;
}

function encodeBase64Transaction(rawTransactionBytes: Uint8Array): string {
  let binary = "";
  const chunkSize = 0x8000;

  for (let index = 0; index < rawTransactionBytes.length; index += chunkSize) {
    const chunk = rawTransactionBytes.subarray(index, index + chunkSize);

    for (let chunkIndex = 0; chunkIndex < chunk.length; chunkIndex += 1) {
      binary += String.fromCharCode(chunk[chunkIndex] ?? 0);
    }
  }

  return btoa(binary);
}

async function waitForTransactionConfirmation(signatureValue: string): Promise<void> {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 1000));

    const statusResponse = await myListingsRpc
      .getSignatureStatuses([signature(signatureValue)])
      .send();
    const status = (statusResponse.value[0] ?? null) as RpcSignatureStatus | null;

    if (status?.err) {
      throw new Error("Transaction failed on-chain");
    }

    if (
      status?.confirmationStatus === "confirmed" ||
      status?.confirmationStatus === "finalized"
    ) {
      return;
    }
  }

  throw new Error("Transaction confirmation timed out");
}

async function executeTensorDelistAction(
  listing: MyListingRecord,
  context: MyListingActionContext,
): Promise<void> {
  if (!context.signTransaction) {
    throw new Error("Wallet does not support versioned transaction signing");
  }

  const response = await fetch("/api/tensor-delist", {
    body: JSON.stringify({
      mint: listing.nftMint,
      owner: context.walletAddress,
    }),
    headers: {
      "Content-Type": "application/json",
    },
    method: "POST",
  });

  const payload = (await response.json()) as TensorDelistBuildResponse | { error?: string };

  if (!response.ok || !("tx" in payload)) {
    throw new Error(
      "error" in payload && payload.error
        ? payload.error
        : "Failed to build Tensor delist transaction",
    );
  }

  const txBytes = Uint8Array.from(atob(payload.tx), (character) => character.charCodeAt(0));
  const transaction = VersionedTransaction.deserialize(txBytes);
  const signedTransaction = await context.signTransaction(transaction);
  const signatureValue = await myListingsRpc
    .sendTransaction(
      toWireTransactionBase64(
        encodeBase64Transaction(signedTransaction.serialize()),
      ),
      {
        encoding: "base64",
        maxRetries: BigInt(5),
        skipPreflight: true,
      },
    )
    .send();

  await waitForTransactionConfirmation(`${signatureValue}`);
}

async function executeArtifacteCancelAction(
  listing: MyListingRecord,
  context: MyListingActionContext,
): Promise<void> {
  if (!context.anchorWallet) {
    throw new Error("Wallet is not ready for listing cancellation");
  }

  const assetMint = new PublicKey(listing.nftMint);
  const ownerPublicKey = new PublicKey(context.walletAddress);
  const auctionProgram = new AuctionProgram(
    context.connection,
    context.anchorWallet,
    context.sendTransaction,
  );

  if (listing.isCore) {
    await auctionProgram.cancelCoreListing(assetMint);
    return;
  }

  if (listing.isPnft) {
    await auctionProgram.cancelListingPnft(assetMint);
    return;
  }

  if (!context.sendTransaction) {
    throw new Error("Wallet does not support transaction submission");
  }

  const tokenProgramId = listing.isToken2022
    ? TOKEN_2022_PROGRAM_ID
    : TOKEN_PROGRAM_ID;
  const sellerAssetAccount = await getAssociatedTokenAddress(
    assetMint,
    ownerPublicKey,
    false,
    tokenProgramId,
  );

  const existingTokenAccount = await context.connection.getAccountInfo(
    sellerAssetAccount,
    "confirmed",
  );

  if (!existingTokenAccount) {
    const createAtaInstruction = createAssociatedTokenAccountInstruction(
      ownerPublicKey,
      sellerAssetAccount,
      ownerPublicKey,
      assetMint,
      tokenProgramId,
      ASSOCIATED_TOKEN_PROGRAM_ID,
    );
    const createAtaTransaction = new Transaction().add(createAtaInstruction);
    const ataSignature = await context.sendTransaction(
      createAtaTransaction,
      context.connection,
    );
    await context.connection.confirmTransaction(ataSignature, "confirmed");
  }

  await auctionProgram.cancelListing(assetMint, sellerAssetAccount);
}

export async function executeMyListingAction(
  listing: MyListingRecord,
  context: MyListingActionContext,
): Promise<void> {
  if (listing.source === "tensor") {
    await executeTensorDelistAction(listing, context);
    return;
  }

  await executeArtifacteCancelAction(listing, context);
}