import { NextResponse } from "next/server";
import { address } from "@solana/kit";

const TENSOR_TXS_GRAPHQL = "https://graphql-txs.tensor.trade/graphql";
const COLLECTOR_CRYPT_API = "https://api.collectorcrypt.com";
const TENSOR_SALE_HISTORY_TIMEOUT_MS = 3_000;
const COLLECTOR_CRYPT_TIMEOUT_MS = 3_000;
const SALE_HISTORY_LIMIT = 12;
const TENSOR_SALE_TX_TYPES = ["SALE_BUY_NOW", "SALE_ACCEPT_BID"] as const;

type TensorSaleHistoryTx = {
  buyerId?: string | null;
  grossAmount?: string | number | null;
  grossAmountUnit?: string | number | null;
  grossAmountUnitInfo?: {
    decimals?: number | null;
    symbol?: string | null;
  } | null;
  sellerId?: string | null;
  source?: string | null;
  txAt?: number | null;
  txId?: string | null;
  txKey?: string | null;
  txType?: string | null;
};

type TensorSaleHistoryResponse = {
  data?: {
    mintTransactions?: {
      txs?: Array<{
        tx?: TensorSaleHistoryTx | null;
      }> | null;
    } | null;
  };
  errors?: Array<{ message?: string }>;
};

type CollectorCryptActivity = {
  action?: string | null;
  amount?: number | string | null;
  cardId?: string | null;
  createdAt?: string | number | null;
  from?: { wallet?: string | null } | null;
  id?: string | null;
  priceInfo?: {
    solPrice?: {
      rawAmount?: string | number | null;
      decimals?: number | null;
      symbol?: string | null;
    } | null;
  } | null;
  source?: string | null;
  to?: { wallet?: string | null } | null;
  transactionUrl?: string | null;
};

export type SaleHistoryItem = {
  buyer: string | null;
  currency: string;
  marketplace: string | null;
  price: number | null;
  seller: string | null;
  signature: string;
  timestamp: number | null;
};

function formatMarketplaceLabel(source: string | null | undefined): string | null {
  if (!source) {
    return null;
  }

  const normalized = source.trim();
  if (!normalized) {
    return null;
  }

  const lower = normalized.toLowerCase();
  if (lower.includes("magiceden") || lower.includes("magic_eden")) {
    return "Magic Eden";
  }

  if (lower === "tcomp" || lower.includes("tensor")) {
    return "Tensor";
  }

  return normalized
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}

function parseNumericAmount(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined) {
    return null;
  }

  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function parseTimestamp(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined) {
    return null;
  }

  if (typeof value === "number") {
    return value > 10_000_000_000 ? Math.floor(value / 1000) : Math.floor(value);
  }

  const numeric = Number(value);
  if (Number.isFinite(numeric)) {
    return numeric > 10_000_000_000 ? Math.floor(numeric / 1000) : Math.floor(numeric);
  }

  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? Math.floor(parsed / 1000) : null;
}

function parseSignature(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }

  const match = value.match(/\/tx\/([^?/#]+)/);
  return match?.[1] ?? value;
}

function parseTensorSalePrice(tx: TensorSaleHistoryTx): { currency: string; price: number | null } {
  const unitAmount = parseNumericAmount(tx.grossAmountUnit);
  const unitSymbol = tx.grossAmountUnitInfo?.symbol?.trim();
  if (unitAmount !== null && unitSymbol) {
    return { currency: unitSymbol, price: unitAmount };
  }

  const rawAmount = parseNumericAmount(tx.grossAmount);
  const rawSymbol = unitSymbol || "SOL";
  const rawDecimals = tx.grossAmountUnitInfo?.decimals ?? (rawSymbol === "SOL" ? 9 : 0);

  return {
    currency: rawSymbol,
    price: rawAmount === null ? null : rawAmount / Math.pow(10, rawDecimals),
  };
}

function parseTensorSaleHistoryItem(tx: TensorSaleHistoryTx | null | undefined): SaleHistoryItem | null {
  const signature = tx?.txId ?? tx?.txKey?.split(":")[0] ?? null;

  if (!tx || !signature) {
    return null;
  }

  const { currency, price } = parseTensorSalePrice(tx);

  return {
    buyer: tx.buyerId ?? null,
    currency: price === null ? "UNKNOWN" : currency,
    marketplace: formatMarketplaceLabel(tx.source),
    price,
    seller: tx.sellerId ?? null,
    signature,
    timestamp: parseTimestamp(tx.txAt),
  };
}

function parseCollectorCryptSaleHistoryItem(activity: CollectorCryptActivity): SaleHistoryItem | null {
  if (activity.action?.toLowerCase() !== "sale") {
    return null;
  }

  const signature = parseSignature(activity.id) ?? parseSignature(activity.transactionUrl);
  if (!signature) {
    return null;
  }

  const solPrice = activity.priceInfo?.solPrice;
  const rawAmount = parseNumericAmount(solPrice?.rawAmount);
  const decimals = solPrice?.decimals ?? 9;
  const price = parseNumericAmount(activity.amount) ?? (rawAmount === null ? null : rawAmount / Math.pow(10, decimals));

  return {
    buyer: activity.to?.wallet ?? null,
    currency: solPrice?.symbol ?? "SOL",
    marketplace: formatMarketplaceLabel(activity.source) ?? "Collector Crypt",
    price,
    seller: activity.from?.wallet ?? null,
    signature,
    timestamp: parseTimestamp(activity.createdAt),
  };
}

async function fetchTensorSaleHistory(mint: string): Promise<SaleHistoryItem[]> {
  const response = await fetch(TENSOR_TXS_GRAPHQL, {
    body: JSON.stringify({
      operationName: "MintSaleTransactions",
      query: `query MintSaleTransactions($mint: String!, $saleTxTypes: [TransactionType!]!, $limit: Int) {
        mintTransactions(mint: $mint, filters: { txTypes: $saleTxTypes }, limit: $limit) {
          txs {
            tx {
              source
              txKey
              txId
              txType
              grossAmount
              grossAmountUnit
              grossAmountUnitInfo {
                decimals
                symbol
              }
              sellerId
              buyerId
              txAt
            }
          }
        }
      }`,
      variables: {
        limit: SALE_HISTORY_LIMIT,
        mint,
        saleTxTypes: TENSOR_SALE_TX_TYPES,
      },
    }),
    cache: "no-store",
    headers: {
      "Content-Type": "application/json",
      Origin: "https://www.tensor.trade",
      Referer: "https://www.tensor.trade/",
    },
    method: "POST",
    signal: AbortSignal.timeout(TENSOR_SALE_HISTORY_TIMEOUT_MS),
  });

  if (!response.ok) {
    throw new Error(`Tensor sale history request failed with status ${response.status}`);
  }

  const payload = (await response.json()) as TensorSaleHistoryResponse;
  if (payload.errors?.length) {
    throw new Error(payload.errors.map((error) => error.message).filter(Boolean).join("; "));
  }

  return (payload.data?.mintTransactions?.txs ?? [])
    .map((item) => parseTensorSaleHistoryItem(item.tx))
    .filter((item): item is SaleHistoryItem => Boolean(item));
}

async function fetchCollectorCryptSaleHistory(mint: string): Promise<SaleHistoryItem[]> {
  const response = await fetch(
    `${COLLECTOR_CRYPT_API}/card-activity/${encodeURIComponent(mint)}?day=All%20time&v2=true`,
    {
      cache: "no-store",
      headers: {
        Accept: "application/json",
        Origin: "https://collectorcrypt.com",
        Referer: "https://collectorcrypt.com/",
      },
      signal: AbortSignal.timeout(COLLECTOR_CRYPT_TIMEOUT_MS),
    },
  );

  if (!response.ok) {
    throw new Error(`Collector Crypt sale history request failed with status ${response.status}`);
  }

  const activities = (await response.json()) as CollectorCryptActivity[];
  return activities
    .map(parseCollectorCryptSaleHistoryItem)
    .filter((item): item is SaleHistoryItem => Boolean(item));
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const mint = searchParams.get("mint");

  if (!mint) {
    return NextResponse.json({ error: "Missing mint" }, { status: 400 });
  }

  let normalizedMint: string;
  try {
    normalizedMint = `${address(mint)}`;
  } catch {
    return NextResponse.json({ error: "Invalid mint" }, { status: 400 });
  }

  const [tensorResult, collectorCryptResult] = await Promise.allSettled([
    fetchTensorSaleHistory(normalizedMint),
    fetchCollectorCryptSaleHistory(normalizedMint),
  ]);

  if (tensorResult.status === "rejected") {
    console.error("[api/sale-history] Failed to load Tensor sale history", tensorResult.reason);
  }

  if (collectorCryptResult.status === "rejected") {
    console.error("[api/sale-history] Failed to load Collector Crypt sale history", collectorCryptResult.reason);
  }

  const bySignature = new Map<string, SaleHistoryItem>();
  for (const item of [
    ...(tensorResult.status === "fulfilled" ? tensorResult.value : []),
    ...(collectorCryptResult.status === "fulfilled" ? collectorCryptResult.value : []),
  ]) {
    bySignature.set(item.signature, item);
  }

  const items = Array.from(bySignature.values())
    .sort((left, right) => (right.timestamp ?? 0) - (left.timestamp ?? 0))
    .slice(0, SALE_HISTORY_LIMIT);

  return NextResponse.json({ items });
}
