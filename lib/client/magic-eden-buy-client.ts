import { createSolanaRpc, signature } from "@solana/kit";
import { PublicKey, SystemProgram, Transaction, VersionedTransaction, Connection } from "@solana/web3.js";
import {
  createAssociatedTokenAccountInstruction,
  createTransferInstruction,
  getAssociatedTokenAddress,
} from "@solana/spl-token";

import type { AnchorWalletLike } from "@/hooks/useWalletCapabilities";
import {
  MAGIC_EDEN_M2_PROGRAM,
  MAGIC_EDEN_M3_PROGRAM,
  type MagicEdenPaymentCurrency,
  type MagicEdenBuyResponse,
} from "@/lib/magic-eden-buy";
import { formatHomeListingQuote } from "@/lib/home-tcg";
import { EXTERNAL_MARKETPLACE_FEE_WALLET } from "@/lib/external-purchase-fees";

type WalletSignTransaction = AnchorWalletLike["signTransaction"];

type ListingDisplayPrice = {
  amount: number;
  currency: string;
};

type RpcSignatureStatus = {
  confirmationStatus?: "processed" | "confirmed" | "finalized" | null;
  err?: object | string | null;
};

export type MagicEdenBuyResult = {
  sig: string;
  confirmed: boolean;
  totalPrice: number;
  currency: string;
};

type MagicEdenBuyOptions = {
  mint: string;
  buyer: string;
  source?: string | null;
  collectionAddress?: string | null;
  collectionName?: string | null;
  signTransaction: WalletSignTransaction;
  listingDisplayPrice: ListingDisplayPrice;
  onStatus?: (message: string) => void;
};

const rpc = createSolanaRpc("/api/rpc");

type WireTransactionBase64 = Parameters<typeof rpc.sendTransaction>[0];

function getRequestedPaymentCurrency(currency: string): MagicEdenPaymentCurrency | undefined {
  if (currency === "SOL" || currency === "USDC") {
    return currency;
  }

  return undefined;
}

function isConfirmedStatus(status: RpcSignatureStatus | null | undefined): boolean {
  return status?.confirmationStatus === "confirmed" || status?.confirmationStatus === "finalized";
}

function serializeSignature(value: string): string {
  return `${value}`;
}

function toWireTransactionBase64(base64Transaction: string): WireTransactionBase64 {
  return base64Transaction as WireTransactionBase64;
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

function decodeBase64Transaction(base64Transaction: string): Uint8Array {
  return Uint8Array.from(atob(base64Transaction), (character) => character.charCodeAt(0));
}

function createProxyConnection(): Connection {
  if (typeof window === "undefined") {
    throw new Error("Magic Eden buy client must run in the browser");
  }

  return new Connection(new URL("/api/rpc", window.location.origin).toString(), "confirmed");
}

async function sendViaProxy(rawTransactionBytes: Uint8Array): Promise<string> {
  const encodedTransaction = encodeBase64Transaction(rawTransactionBytes);
  const signatureValue = await rpc
    .sendTransaction(toWireTransactionBase64(encodedTransaction), {
      skipPreflight: true,
      encoding: "base64",
      maxRetries: BigInt(3),
    })
    .send();

  return serializeSignature(signatureValue);
}

async function preSimulateTransaction(base64Transaction: string): Promise<void> {
  try {
    await rpc
      .simulateTransaction(toWireTransactionBase64(base64Transaction), {
        sigVerify: false,
        encoding: "base64",
        commitment: "processed",
      })
      .send();
  } catch {}
}

async function signVersionedTransaction(
  base64Transaction: string,
  signTransaction: WalletSignTransaction,
  buyer: string
): Promise<Uint8Array> {
  await preSimulateTransaction(base64Transaction);
  const transactionBytes = decodeBase64Transaction(base64Transaction);
  const transaction = VersionedTransaction.deserialize(transactionBytes);
  validateMagicEdenTransaction(transaction, buyer);
  const signedTransaction = await signTransaction(transaction);
  return signedTransaction.serialize();
}

async function signLegacyTransaction(
  base64Transaction: string,
  signTransaction: WalletSignTransaction
): Promise<Uint8Array> {
  const transactionBytes = decodeBase64Transaction(base64Transaction);
  const transaction = Transaction.from(transactionBytes);
  const signedTransaction = await signTransaction(transaction);
  return signedTransaction.serialize();
}

async function buildM2FeeTransaction(base64Buyer: string, rawAmount: number, currency: MagicEdenPaymentCurrency): Promise<Transaction> {
  const connection = createProxyConnection();
  const buyer = new PublicKey(base64Buyer);
  const treasury = new PublicKey(EXTERNAL_MARKETPLACE_FEE_WALLET);
  const transaction = new Transaction();
  const latestBlockhash = await connection.getLatestBlockhash("confirmed");

  transaction.feePayer = buyer;
  transaction.recentBlockhash = latestBlockhash.blockhash;

  if (currency === "SOL") {
    transaction.add(
      SystemProgram.transfer({
        fromPubkey: buyer,
        toPubkey: treasury,
        lamports: rawAmount,
      }),
    );
    return transaction;
  }

  const usdcMint = new PublicKey("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v");
  const buyerUsdcAta = await getAssociatedTokenAddress(usdcMint, buyer);
  const treasuryUsdcAta = await getAssociatedTokenAddress(usdcMint, treasury);
  const treasuryAtaInfo = await connection.getAccountInfo(treasuryUsdcAta);

  if (!treasuryAtaInfo) {
    transaction.add(
      createAssociatedTokenAccountInstruction(buyer, treasuryUsdcAta, treasury, usdcMint),
    );
  }

  transaction.add(
    createTransferInstruction(buyerUsdcAta, treasuryUsdcAta, buyer, rawAmount),
  );

  return transaction;
}

async function waitForTransactionConfirmation(signatureValue: string): Promise<boolean> {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 3000));

    const statusResponse = await rpc.getSignatureStatuses([signature(signatureValue)]).send();
    const status = (statusResponse.value[0] ?? null) as RpcSignatureStatus | null;

    if (status?.err) {
      throw new Error("Transaction failed on-chain");
    }

    if (isConfirmedStatus(status)) {
      return true;
    }
  }

  return false;
}

async function getBuildResponse(response: Response): Promise<MagicEdenBuyResponse> {
  const buildResponse: MagicEdenBuyResponse = await response.json();
  return buildResponse;
}

function validateMagicEdenTransaction(
  transaction: VersionedTransaction,
  buyer: string
): void {
  const feePayer = transaction.message.staticAccountKeys[0]?.toBase58() ?? null;
  if (feePayer !== buyer) {
    throw new Error("Transaction fee payer doesn't match connected wallet");
  }

  const hasMagicEdenProgram = transaction.message.staticAccountKeys.some((accountKey) => {
    const address = accountKey.toBase58();
    return address === MAGIC_EDEN_M2_PROGRAM || address === MAGIC_EDEN_M3_PROGRAM;
  });

  if (!hasMagicEdenProgram) {
    throw new Error("Transaction doesn't interact with ME marketplace");
  }
}

export async function executeMagicEdenBuy({
  mint,
  buyer,
  source,
  collectionAddress,
  collectionName,
  signTransaction,
  listingDisplayPrice,
  onStatus,
}: MagicEdenBuyOptions): Promise<MagicEdenBuyResult> {
  const buildResponse = await fetch("/api/me-buy", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      mint,
      buyer,
      source,
      listingCurrency: getRequestedPaymentCurrency(listingDisplayPrice.currency),
      collectionAddress,
      collectionName,
    }),
  });

  if (!buildResponse.ok) {
    let errorMessage = "Failed to build transaction";

    try {
      const errorPayload: { error?: string } = await buildResponse.json();
      errorMessage = errorPayload.error ?? errorMessage;
    } catch {}

    throw new Error(errorMessage);
  }

  const buildResult = await getBuildResponse(buildResponse);
  const currency = buildResult.displayCurrency ?? listingDisplayPrice.currency;
  const totalPrice =
    (buildResult.displayPrice ?? listingDisplayPrice.amount) +
    (buildResult.platformFeeCurrency === currency && buildResult.platformFee ? buildResult.platformFee : 0);

  onStatus?.(`💳 Confirm purchase — ${formatHomeListingQuote(totalPrice, currency)}`);

  let signedMainTransaction: Uint8Array;

  if (buildResult.v0TxSigned) {
    signedMainTransaction = await signVersionedTransaction(buildResult.v0TxSigned, signTransaction, buyer);
  } else if (buildResult.v0Tx) {
    signedMainTransaction = await signVersionedTransaction(buildResult.v0Tx, signTransaction, buyer);
  } else if (buildResult.legacyTx) {
    signedMainTransaction = await signLegacyTransaction(buildResult.legacyTx, signTransaction);
  } else {
    throw new Error("No transaction returned from API");
  }

  let signedFeeTransaction: Uint8Array | null = null;
  const needsSeparateM2Fee =
    buildResult.feeApplied &&
    buildResult.listingSource === "M2" &&
    buildResult.platformFeeRawAmount > 0;

  if (needsSeparateM2Fee) {
    onStatus?.(`💳 Confirm Artifacte fee — ${formatHomeListingQuote(buildResult.platformFee, buildResult.platformFeeCurrency)}`);
    const feeTransaction = await buildM2FeeTransaction(buyer, buildResult.platformFeeRawAmount, buildResult.platformFeeCurrency);
    const signedFee = await signTransaction(feeTransaction);
    signedFeeTransaction = signedFee.serialize();
  }

  const transactionSignature = await sendViaProxy(signedMainTransaction);

  const confirmed = await waitForTransactionConfirmation(transactionSignature);

  if (confirmed && signedFeeTransaction) {
    try {
      onStatus?.("⏳ Finalizing Artifacte fee...");
      const feeSignature = await sendViaProxy(signedFeeTransaction);
      await waitForTransactionConfirmation(feeSignature);
    } catch (error) {
      onStatus?.("Artifacte fee transfer failed after purchase. Please contact support.");
      console.warn("[me-buy-client] Artifacte fee transfer failed after purchase", error);
    }
  }

  return {
    sig: transactionSignature,
    confirmed,
    totalPrice,
    currency,
  };
}