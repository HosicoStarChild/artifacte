import { NextRequest, NextResponse } from "next/server";
import { Connection } from "@solana/web3.js";
import { getCuratedMarketplaceListing } from "@/app/lib/digital-art-marketplaces";

const TENSOR_API_KEY = process.env.TENSOR_API_KEY;
const TENSOR_API_BASE = "https://api.mainnet.tensordev.io/api/v1";
const HELIUS_RPC = process.env.HELIUS_API_KEY
  ? `https://mainnet.helius-rpc.com/?api-key=${process.env.HELIUS_API_KEY}`
  : "https://api.mainnet-beta.solana.com";

const rateMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT = 10;
const RATE_WINDOW_MS = 60_000;

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = rateMap.get(ip);
  if (!entry || now > entry.resetAt) {
    rateMap.set(ip, { count: 1, resetAt: now + RATE_WINDOW_MS });
    return true;
  }
  if (entry.count >= RATE_LIMIT) return false;
  entry.count += 1;
  return true;
}

function toBase64(value: unknown): string | null {
  if (!value) return null;
  if (typeof value === "string") {
    return value;
  }
  if (Array.isArray(value)) {
    return Buffer.from(value).toString("base64");
  }
  if (
    typeof value === "object" &&
    value !== null &&
    "data" in value &&
    Array.isArray((value as { data?: unknown }).data)
  ) {
    return Buffer.from((value as { data: number[] }).data).toString("base64");
  }
  return null;
}

export async function POST(req: NextRequest) {
  try {
    const ip =
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      req.headers.get("x-real-ip") ||
      "unknown";

    if (!checkRateLimit(ip)) {
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

    const { collectionAddress, mint, buyer } = await req.json();
    if (!collectionAddress || !mint || !buyer) {
      return NextResponse.json(
        { error: "Missing collectionAddress, mint, or buyer" },
        { status: 400 }
      );
    }

    const listing = await getCuratedMarketplaceListing({
      collectionAddress,
      source: "tensor",
      mint,
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

    const connection = new Connection(HELIUS_RPC, "confirmed");
    const latestBlockhash = await connection.getLatestBlockhash("finalized");

    const params = new URLSearchParams({
      buyer: String(buyer),
      mint: listing.mint,
      owner: listing.seller,
      maxPrice: String(listing.priceRaw),
      blockhash: latestBlockhash.blockhash,
    });

    const response = await fetch(`${TENSOR_API_BASE}/tx/buy?${params.toString()}`, {
      headers: {
        accept: "application/json",
        "x-tensor-api-key": TENSOR_API_KEY,
      },
      cache: "no-store",
      signal: AbortSignal.timeout(15000),
    });

    if (!response.ok) {
      const message = await response.text();
      return NextResponse.json(
        { error: message || "Failed to build Tensor buy transaction" },
        { status: 502 }
      );
    }

    const payload = await response.json();
    const txs = Array.isArray(payload?.txs) ? payload.txs : [];
    if (!txs.length) {
      return NextResponse.json(
        { error: "Tensor did not return any transactions" },
        { status: 502 }
      );
    }

    return NextResponse.json({
      ok: true,
      mint: listing.mint,
      seller: listing.seller,
      price: listing.price,
      priceRaw: listing.priceRaw,
      currencySymbol: listing.currencySymbol,
      blockhash: latestBlockhash.blockhash,
      lastValidBlockHeight: latestBlockhash.lastValidBlockHeight,
      txs: txs.map((tx: any) => ({
        txV0: toBase64(tx?.txV0?.data || tx?.txV0),
        tx: toBase64(tx?.tx?.data || tx?.tx),
      })),
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "Failed to build Tensor buy transaction" },
      { status: 500 }
    );
  }
}
