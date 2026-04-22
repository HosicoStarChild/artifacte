import { address } from "@solana/kit";
import {
  AddressLookupTableAccount,
  Connection,
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionMessage,
  VersionedTransaction,
} from "@solana/web3.js";
import { NextRequest, NextResponse } from "next/server";

import { getDigitalArtExternalListingDetail } from "@/app/digital-art/_lib/server-data";
import {
  EXTERNAL_MARKETPLACE_FEE_WALLET,
  calculateExternalMarketplaceFeeAmount,
  shouldApplyExternalMarketplaceFee,
} from "@/lib/external-purchase-fees";

const TENSOR_API_KEY = process.env.TENSOR_API_KEY;
const TENSOR_API_BASE = "https://api.mainnet.tensordev.io/api/v1";
const HELIUS_RPC = process.env.HELIUS_API_KEY
  ? `https://mainnet.helius-rpc.com/?api-key=${process.env.HELIUS_API_KEY}`
  : "https://api.mainnet-beta.solana.com";

const RATE_LIMIT = 10;
const RATE_WINDOW_MS = 60_000;
const rateMap = new Map<string, { count: number; resetAt: number }>();

type TensorWireBuffer = {
  data?: number[];
};

type TensorWireData = string | number[] | Uint8Array | TensorWireBuffer | null | undefined;

interface TensorWireTransaction {
  tx?: TensorWireData;
  txV0?: TensorWireData;
}

interface TensorBuyPayload {
  txs?: TensorWireTransaction[];
}

interface TensorStandardBuyRequest {
  buyer: string;
  collectionAddress: string;
  mint: string;
}

interface TensorStandardBuyResponse {
  blockhash: string;
  currencySymbol: string;
  feeApplied: boolean;
  lastValidBlockHeight: number;
  mint: string;
  ok: true;
  platformFee: number;
  platformFeeCurrency: "SOL";
  price: number;
  priceRaw: number;
  seller: string;
  txs: Array<{
    tx: string | null;
    txV0: string | null;
  }>;
}

function getIpAddress(request: NextRequest): string {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "unknown"
  );
}

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = rateMap.get(ip);

  if (!entry || now > entry.resetAt) {
    rateMap.set(ip, { count: 1, resetAt: now + RATE_WINDOW_MS });
    return true;
  }

  if (entry.count >= RATE_LIMIT) {
    return false;
  }

  entry.count += 1;
  return true;
}

function unwrapWireData(value: TensorWireData): TensorWireData {
  if (
    !value ||
    typeof value === "string" ||
    Array.isArray(value) ||
    value instanceof Uint8Array
  ) {
    return value;
  }

  return value.data;
}

function toBase64(value: TensorWireData): string | null {
  if (!value) {
    return null;
  }

  if (typeof value === "string") {
    return value;
  }

  if (Array.isArray(value) || value instanceof Uint8Array) {
    return Buffer.from(value).toString("base64");
  }

  if (Array.isArray(value.data)) {
    return Buffer.from(value.data).toString("base64");
  }

  return null;
}

function toUint8Array(value: Exclude<TensorWireData, null | undefined>): Uint8Array {
  if (typeof value === "string") {
    return Uint8Array.from(atob(value), (character) => character.charCodeAt(0));
  }

  if (Array.isArray(value) || value instanceof Uint8Array) {
    return Uint8Array.from(value);
  }

  return Uint8Array.from(value.data ?? []);
}

function parseRequestBody(body: unknown): TensorStandardBuyRequest {
  if (typeof body !== "object" || body === null) {
    throw new Error("Invalid request body");
  }

  const candidate = body as Record<string, unknown>;
  const buyer = typeof candidate.buyer === "string" ? candidate.buyer.trim() : "";
  const collectionAddress =
    typeof candidate.collectionAddress === "string"
      ? candidate.collectionAddress.trim()
      : "";
  const mint = typeof candidate.mint === "string" ? candidate.mint.trim() : "";

  if (!buyer || !collectionAddress || !mint) {
    throw new Error("Missing collectionAddress, mint, or buyer");
  }

  return {
    buyer: `${address(buyer)}`,
    collectionAddress: `${address(collectionAddress)}`,
    mint: `${address(mint)}`,
  };
}

async function fetchLookupTableAccounts(
  connection: Connection,
  transaction: VersionedTransaction
): Promise<AddressLookupTableAccount[]> {
  const lookupAccounts = await Promise.all(
    transaction.message.addressTableLookups.map(async (lookup) => {
      const result = await connection.getAddressLookupTable(lookup.accountKey);
      return result.value;
    })
  );

  return lookupAccounts.filter(
    (lookupAccount): lookupAccount is AddressLookupTableAccount => lookupAccount !== null
  );
}

async function injectFeeIntoTransaction(input: {
  connection: Connection;
  feeInstruction: ReturnType<typeof SystemProgram.transfer>;
  wireTransaction: TensorWireTransaction;
}): Promise<{ tx: string | null; txV0: string | null }> {
  const txV0Data = unwrapWireData(input.wireTransaction.txV0);
  const txData = unwrapWireData(input.wireTransaction.tx);
  const rawTransaction = txV0Data ?? txData;

  if (!rawTransaction) {
    return { tx: null, txV0: null };
  }

  const transactionBytes = toUint8Array(rawTransaction);

  if (txV0Data) {
    const versionedTransaction = VersionedTransaction.deserialize(transactionBytes);
    const lookupTableAccounts = await fetchLookupTableAccounts(
      input.connection,
      versionedTransaction
    );
    const decompiledMessage = TransactionMessage.decompile(versionedTransaction.message, {
      addressLookupTableAccounts: lookupTableAccounts,
    });

    decompiledMessage.instructions.push(input.feeInstruction);

    const recompiledMessage = decompiledMessage.compileToV0Message(lookupTableAccounts);
    return {
      tx: null,
      txV0: Buffer.from(new VersionedTransaction(recompiledMessage).serialize()).toString("base64"),
    };
  }

  const legacyTransaction = Transaction.from(transactionBytes);
  legacyTransaction.add(input.feeInstruction);

  return {
    tx: Buffer.from(
      legacyTransaction.serialize({ requireAllSignatures: false })
    ).toString("base64"),
    txV0: null,
  };
}

export async function POST(request: NextRequest) {
  try {
    const ipAddress = getIpAddress(request);
    if (!checkRateLimit(ipAddress)) {
      return NextResponse.json(
        { error: "Rate limit exceeded. Try again in a minute." },
        { status: 429 }
      );
    }

    if (!TENSOR_API_KEY) {
      return NextResponse.json(
        { error: "TENSOR_API_KEY is not configured" },
        { status: 500 }
      );
    }

    const { buyer, collectionAddress, mint } = parseRequestBody(await request.json());
    const listing = await getDigitalArtExternalListingDetail({
      collectionAddress,
      mint,
      source: "tensor",
    });

    if (!listing) {
      return NextResponse.json(
        { error: "Listing not found or no longer available" },
        { status: 404 }
      );
    }

    if (listing.buyKind === "tensorCompressed") {
      return NextResponse.json(
        { error: "Compressed Tensor listings must use the compressed buy route" },
        { status: 409 }
      );
    }

    if (listing.buyKind !== "tensorStandard") {
      return NextResponse.json(
        { error: "Unsupported Tensor listing type" },
        { status: 409 }
      );
    }

    const connection = new Connection(HELIUS_RPC, "confirmed");
    const latestBlockhash = await connection.getLatestBlockhash("finalized");
    const tensorParams = new URLSearchParams({
      blockhash: latestBlockhash.blockhash,
      buyer,
      maxPrice: String(listing.priceRaw),
      mint: listing.mint,
      owner: listing.seller,
    });
    const tensorResponse = await fetch(
      `${TENSOR_API_BASE}/tx/buy?${tensorParams.toString()}`,
      {
        cache: "no-store",
        headers: {
          accept: "application/json",
          "x-tensor-api-key": TENSOR_API_KEY,
        },
        signal: AbortSignal.timeout(15_000),
      }
    );

    if (!tensorResponse.ok) {
      const message = await tensorResponse.text();
      return NextResponse.json(
        { error: message || "Failed to build Tensor buy transaction" },
        { status: 502 }
      );
    }

    const tensorPayload = (await tensorResponse.json()) as TensorBuyPayload;
    const wireTransactions = Array.isArray(tensorPayload.txs) ? tensorPayload.txs : [];

    if (!wireTransactions.length) {
      return NextResponse.json(
        { error: "Tensor did not return any transactions" },
        { status: 502 }
      );
    }

    const feeApplied = shouldApplyExternalMarketplaceFee({
      collectionAddress: listing.collectionAddress,
      collectionName: listing.collectionName,
      source: listing.source,
    });

    if (!feeApplied) {
      const responsePayload: TensorStandardBuyResponse = {
        blockhash: latestBlockhash.blockhash,
        currencySymbol: listing.currencySymbol,
        feeApplied: false,
        lastValidBlockHeight: latestBlockhash.lastValidBlockHeight,
        mint: listing.mint,
        ok: true,
        platformFee: 0,
        platformFeeCurrency: "SOL",
        price: listing.price,
        priceRaw: listing.priceRaw,
        seller: listing.seller,
        txs: wireTransactions.map((wireTransaction) => ({
          tx: toBase64(unwrapWireData(wireTransaction.tx)),
          txV0: toBase64(unwrapWireData(wireTransaction.txV0)),
        })),
      };

      return NextResponse.json(responsePayload);
    }

    const platformFeeLamports = calculateExternalMarketplaceFeeAmount(listing.priceRaw);
    const feeInstruction = SystemProgram.transfer({
      fromPubkey: new PublicKey(buyer),
      lamports: platformFeeLamports,
      toPubkey: new PublicKey(EXTERNAL_MARKETPLACE_FEE_WALLET),
    });
    const modifiedTransactions = await Promise.all(
      wireTransactions.map((wireTransaction, index) =>
        index === 0
          ? injectFeeIntoTransaction({
              connection,
              feeInstruction,
              wireTransaction,
            })
          : Promise.resolve({
              tx: toBase64(unwrapWireData(wireTransaction.tx)),
              txV0: toBase64(unwrapWireData(wireTransaction.txV0)),
            })
      )
    );

    const responsePayload: TensorStandardBuyResponse = {
      blockhash: latestBlockhash.blockhash,
      currencySymbol: listing.currencySymbol,
      feeApplied: true,
      lastValidBlockHeight: latestBlockhash.lastValidBlockHeight,
      mint: listing.mint,
      ok: true,
      platformFee: platformFeeLamports / 1_000_000_000,
      platformFeeCurrency: "SOL",
      price: listing.price,
      priceRaw: listing.priceRaw,
      seller: listing.seller,
      txs: modifiedTransactions,
    };

    return NextResponse.json(responsePayload);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to build Tensor buy transaction";
    const status = message.startsWith("Missing") || message.startsWith("Invalid") ? 400 : 500;

    if (status === 500) {
      console.error("[tensor-buy-standard]", error);
    }

    return NextResponse.json({ error: message }, { status });
  }
}