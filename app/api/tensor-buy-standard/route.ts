import { NextRequest, NextResponse } from "next/server";
import { Connection, PublicKey, SystemProgram, TransactionMessage, VersionedTransaction, Transaction } from "@solana/web3.js";
import { getCuratedMarketplaceListing } from "@/app/lib/digital-art-marketplaces";

const TENSOR_API_KEY = process.env.TENSOR_API_KEY;
const TENSOR_API_BASE = "https://api.mainnet.tensordev.io/api/v1";
const HELIUS_RPC = process.env.HELIUS_API_KEY
  ? `https://mainnet.helius-rpc.com/?api-key=${process.env.HELIUS_API_KEY}`
  : "https://api.mainnet-beta.solana.com";
const TREASURY_WALLET = '82v8xATLqdvq3cS1CXwpygVUH926QKdAd4NVxD91r4a6';
const PLATFORM_FEE_BPS = 200; // 2%

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

    // ── Inject 2% platform fee into the first transaction ──
    const platformFeeLamports = Math.ceil(listing.priceRaw * PLATFORM_FEE_BPS / 10000);
    const platformFee = platformFeeLamports / 1e9;
    const buyerPk = new PublicKey(buyer);
    const treasuryPk = new PublicKey(TREASURY_WALLET);

    const feeIx = SystemProgram.transfer({
      fromPubkey: buyerPk,
      toPubkey: treasuryPk,
      lamports: platformFeeLamports,
    });

    const modifiedTxs: { txV0: string | null; tx: string | null }[] = [];

    for (let i = 0; i < txs.length; i++) {
      const rawTx = txs[i];
      const txV0Data = rawTx?.txV0?.data || rawTx?.txV0;
      const txData = rawTx?.tx?.data || rawTx?.tx;

      // Only inject fee into the first transaction
      if (i === 0) {
        const isVersioned = Boolean(txV0Data);
        const raw = txV0Data || txData;
        if (!raw) {
          modifiedTxs.push({ txV0: null, tx: null });
          continue;
        }

        try {
          const txBytes = typeof raw === 'string'
            ? Uint8Array.from(atob(raw), (c: string) => c.charCodeAt(0))
            : Uint8Array.from(Array.isArray(raw) ? raw : raw);

          if (isVersioned) {
            const vTx = VersionedTransaction.deserialize(txBytes);
            // Fetch ALTs referenced in the transaction
            const altAccounts = await Promise.all(
              vTx.message.addressTableLookups.map(async (lookup: any) => {
                const res = await connection.getAddressLookupTable(lookup.accountKey);
                return res.value;
              })
            );
            const validAlts = altAccounts.filter((a): a is NonNullable<typeof a> => a != null);

            const decompiled = TransactionMessage.decompile(vTx.message, {
              addressLookupTableAccounts: validAlts,
            });
            decompiled.instructions.push(feeIx);

            const recompiled = decompiled.compileToV0Message(validAlts);
            const newTx = new VersionedTransaction(recompiled);
            modifiedTxs.push({
              txV0: Buffer.from(newTx.serialize()).toString('base64'),
              tx: null,
            });
          } else {
            const legacyTx = Transaction.from(txBytes);
            legacyTx.add(feeIx);
            modifiedTxs.push({
              txV0: null,
              tx: Buffer.from(legacyTx.serialize({ requireAllSignatures: false })).toString('base64'),
            });
          }
          console.log(`[tensor-buy-standard] Injected 2% platform fee: ${platformFee} SOL (${platformFeeLamports} lamports)`);
        } catch (feeErr: any) {
          console.error('[tensor-buy-standard] Failed to inject fee, using original tx:', feeErr.message);
          modifiedTxs.push({
            txV0: toBase64(txV0Data),
            tx: toBase64(txData),
          });
        }
      } else {
        // Pass through subsequent transactions unmodified
        modifiedTxs.push({
          txV0: toBase64(txV0Data),
          tx: toBase64(txData),
        });
      }
    }

    return NextResponse.json({
      ok: true,
      mint: listing.mint,
      seller: listing.seller,
      price: listing.price,
      platformFee,
      priceRaw: listing.priceRaw,
      currencySymbol: listing.currencySymbol,
      blockhash: latestBlockhash.blockhash,
      lastValidBlockHeight: latestBlockhash.lastValidBlockHeight,
      txs: modifiedTxs,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "Failed to build Tensor buy transaction" },
      { status: 500 }
    );
  }
}
