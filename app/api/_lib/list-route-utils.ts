import { address } from "@solana/kit";
import { NextResponse } from "next/server";
import { resolveHeliusAssetImageSrc } from "@/lib/helius-asset-image";
import {
  AddressLookupTableAccount,
  ComputeBudgetProgram,
  Connection,
  PublicKey,
  TransactionInstruction,
  TransactionMessage,
  VersionedTransaction,
} from "@solana/web3.js";

export interface RateLimitEntry {
  count: number;
  resetAt: number;
}

export interface DasProxyRequestBody {
  id?: number | string;
  method?: string;
  params?: Record<string, boolean | number | string | Record<string, boolean | number | string>>;
}

export interface TensorBuildRequestBody {
  amount?: number;
  currency?: string;
  mint?: string;
  owner?: string;
}

export interface ListingNotifyRequestBody {
  mint?: string;
}

export interface HeliusJsonRpcError {
  message?: string;
}

export interface HeliusAssetFile {
  cdn_uri?: string;
  uri?: string;
}

export interface HeliusAssetResponse {
  result?: {
    authorities?: Array<{ address?: string }>;
    content?: {
      files?: HeliusAssetFile[];
      links?: {
        image?: string;
      };
      metadata?: {
        attributes?: Array<{ trait_type?: string; value?: boolean | number | string | null }>;
        description?: string;
        name?: string;
        symbol?: string;
      };
    };
    creators?: Array<{ address?: string }>;
    grouping?: Array<{ group_key?: string; group_value?: string }>;
    mint_extensions?: {
      metadata?: {
        additional_metadata?: Array<[string, string]>;
      };
    } | null;
    royalty?: {
      basis_points?: number;
    };
  };
}

export interface TensorInstructionAccount {
  address: string | { address: string };
  role: number;
}

export interface TensorInstructionLike {
  accounts: TensorInstructionAccount[];
  data: Uint8Array;
  programAddress: string;
}

export interface TensorPseudoSigner {
  address: ReturnType<typeof address>;
  signTransactions: () => Promise<[]>;
}

const DEFAULT_RATE_LIMIT_WINDOW_MS = 60_000;
const DEFAULT_REQUEST_TIMEOUT_MS = 12_000;

export const LIST_PAGE_ALLOWED_DAS_METHODS = new Set([
  "getAssetsByOwner",
  "getAsset",
  "getAssetBatch",
  "searchAssets",
]);

export function createRateLimiter(maxRequests: number, windowMs = DEFAULT_RATE_LIMIT_WINDOW_MS) {
  const rateMap = new Map<string, RateLimitEntry>();

  return (key: string): boolean => {
    const now = Date.now();
    const entry = rateMap.get(key);

    if (!entry || now > entry.resetAt) {
      rateMap.set(key, { count: 1, resetAt: now + windowMs });
      return true;
    }

    if (entry.count >= maxRequests) {
      return false;
    }

    entry.count += 1;
    return true;
  };
}

export function getRequestIp(headers: Headers): string {
  const forwardedFor = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const realIp = headers.get("x-real-ip")?.trim();

  return forwardedFor || realIp || "unknown";
}

export function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

export function reinterpret<TTarget, TSource>(value: TSource): TTarget {
  return value as never as TTarget;
}

export function withRequestTimeout(timeoutMs = DEFAULT_REQUEST_TIMEOUT_MS): AbortSignal {
  return AbortSignal.timeout(timeoutMs);
}

export function ensureHeliusRpcUrl(): string {
  const apiKey = process.env.HELIUS_API_KEY;

  if (!apiKey) {
    throw new Error("HELIUS_API_KEY is not configured.");
  }

  return `https://mainnet.helius-rpc.com/?api-key=${apiKey}`;
}

export async function fetchHeliusRpc<TResponse>(rpcUrl: string, body: object): Promise<TResponse> {
  const response = await fetch(rpcUrl, {
    body: JSON.stringify(body),
    headers: {
      "Content-Type": "application/json",
    },
    method: "POST",
    signal: withRequestTimeout(),
  });

  if (!response.ok) {
    throw new Error(`Helius error: ${response.status}`);
  }

  return (await response.json()) as TResponse;
}

export function parseMintAddress(value: string | null | undefined, fieldName = "mint"): string {
  if (!value?.trim()) {
    throw new Error(`Missing ${fieldName}.`);
  }

  return `${address(value.trim())}`;
}

export function parseOwnerAddress(value: string | null | undefined, fieldName = "owner"): string {
  if (!value?.trim()) {
    throw new Error(`Missing ${fieldName}.`);
  }

  return `${address(value.trim())}`;
}

export function parsePositiveInteger(value: number | undefined, fieldName: string): number {
  if (!Number.isFinite(value) || !Number.isSafeInteger(value) || (value ?? 0) <= 0) {
    throw new Error(`Invalid ${fieldName}.`);
  }

  return value ?? 0;
}

export function parseTensorCurrency(value: string | undefined): "USDC" | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (value !== "USDC") {
    throw new Error("Invalid currency.");
  }

  return value;
}

export function parseDasProxyRequest(body: Partial<DasProxyRequestBody>): Required<Pick<DasProxyRequestBody, "method">> & DasProxyRequestBody {
  if (!body.method || !LIST_PAGE_ALLOWED_DAS_METHODS.has(body.method)) {
    throw new Error(`Method not allowed: ${body.method ?? "unknown"}`);
  }

  return {
    id: body.id ?? "das-proxy",
    method: body.method,
    params: body.params,
  };
}

export function parseTensorBuildRequest(body: Partial<TensorBuildRequestBody>) {
  return {
    amount: parsePositiveInteger(body.amount, "amount"),
    currency: parseTensorCurrency(body.currency),
    mint: parseMintAddress(body.mint),
    owner: parseOwnerAddress(body.owner),
  };
}

export function parseListingNotifyRequest(body: Partial<ListingNotifyRequestBody>) {
  return {
    mint: parseMintAddress(body.mint),
  };
}

export function buildNftLookupResponse(asset: HeliusAssetResponse["result"], mint: string) {
  if (!asset) {
    return {
      nft: {
        collection: "Unknown",
        description: "",
        image: "/placeholder.png",
        mint,
        name: "NFT",
        symbol: "",
      },
    };
  }

  const content = asset.content ?? {};
  const metadata = content.metadata ?? {};
  const collection = asset.grouping?.find((group) => group.group_key === "collection")?.group_value;
  const image = resolveHeliusAssetImageSrc(asset, { fallbackMint: mint }) ?? "/placeholder.png";

  return {
    nft: {
      attributes: metadata.attributes ?? [],
      authorities: asset.authorities ?? [],
      collection: collection ?? metadata.symbol ?? "Unknown",
      creators: asset.creators ?? [],
      description: metadata.description ?? "",
      image,
      mint,
      mint_extensions: asset.mint_extensions ?? null,
      name: metadata.name ?? "Untitled",
      royalty: asset.royalty ?? {},
      symbol: metadata.symbol ?? "",
    },
    result: asset,
  };
}

export function createTensorPseudoSigner(ownerAddress: string): TensorPseudoSigner {
  return {
    address: address(ownerAddress),
    signTransactions: async () => [],
  };
}

export function toWeb3TransactionInstruction(instruction: TensorInstructionLike): TransactionInstruction {
  return new TransactionInstruction({
    data: Buffer.from(instruction.data),
    keys: instruction.accounts.map((account) => {
      const resolvedAddress = typeof account.address === "string"
        ? account.address
        : account.address.address;

      return {
        isSigner: account.role >= 2,
        isWritable: account.role === 1 || account.role === 3,
        pubkey: new PublicKey(resolvedAddress),
      };
    }),
    programId: new PublicKey(instruction.programAddress),
  });
}

export async function createBase64VersionedTransaction({
  computeUnitLimit = 400_000,
  connection,
  instruction,
  lookupTables = [],
  payer,
}: {
  computeUnitLimit?: number;
  connection: Connection;
  instruction: TensorInstructionLike;
  lookupTables?: AddressLookupTableAccount[];
  payer: string;
}): Promise<string> {
  const latestBlockhash = await connection.getLatestBlockhash("confirmed");
  const message = new TransactionMessage({
    instructions: [
      ComputeBudgetProgram.setComputeUnitLimit({ units: computeUnitLimit }),
      toWeb3TransactionInstruction(instruction),
    ],
    payerKey: new PublicKey(payer),
    recentBlockhash: latestBlockhash.blockhash,
  }).compileToV0Message(lookupTables);

  return Buffer.from(new VersionedTransaction(message).serialize()).toString("base64");
}

export async function waitForWeb3Confirmation(
  connection: Connection,
  signatureValue: string,
  attempts = 30,
  intervalMs = 500
): Promise<void> {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const status = await connection.getSignatureStatuses([signatureValue]);
    const confirmation = status.value[0];

    if (confirmation?.err) {
      throw new Error("Transaction failed while waiting for confirmation.");
    }

    if (confirmation?.confirmationStatus === "confirmed" || confirmation?.confirmationStatus === "finalized") {
      return;
    }

    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }

  throw new Error("Transaction confirmation timed out.");
}