import { NextResponse } from "next/server";
import {
  getCollectionAddress,
  readCuratedCollections,
} from "@/app/lib/digital-art-marketplaces";
import type { AllowlistEntry } from "@/lib/allowlist";

interface FloorCollectionConfig {
  address: string;
  name: string;
  symbol: string;
}

// Tensor-only collections (not on ME) — manually updated floors
const TENSOR_ONLY_FLOORS: Record<string, number> = {
  BuAYoZPVwQw4AfeEpHTx6iGPbQtB27W7tJUjgyLzgiko: 0.45, // Quekz (old)
  "2hwTMM3uWRvNny8YxSEKQkHZ8NHB5BRv7f35ccMWg1ay": 0.45, // Quekz (WNS)
  DGygonz7pn6AFrb1nUUyH3Bu5SVuuCSu38AZWT1cAC4B: 1.29, // ZMB Wave 1
  DF9oV9ZeUPRh3XUS5opiivRHn9HjqW4kUxD6k1tK8Bqf: 1.29, // ZMB Wave 2
  DC1vqfCoZbZT2jS6NDv1LAL4W3RvLKW5RPZfs13AhbsH: 1.29, // ZMB Wave 3
};

let cache: { data: Record<string, number>; timestamp: number } | null = null;
const CACHE_TTL = 15 * 60 * 1000;

function getMagicEdenCollections(entries: AllowlistEntry[]): FloorCollectionConfig[] {
  return entries
    .map((entry) => {
      const address = getCollectionAddress(entry);
      const symbol = entry.marketplaces?.magicEden?.symbol;
      if (!address || !symbol) return null;
      return {
        address,
        name: entry.name,
        symbol,
      };
    })
    .filter((entry): entry is FloorCollectionConfig => Boolean(entry));
}

async function fetchFloorPrices(): Promise<{
  floors: Record<string, number>;
  collections: FloorCollectionConfig[];
}> {
  if (cache && Date.now() - cache.timestamp < CACHE_TTL) {
    const collections = getMagicEdenCollections(await readCuratedCollections());
    return { floors: cache.data, collections };
  }

  const collections = getMagicEdenCollections(await readCuratedCollections());
  const floors: Record<string, number> = {};

  await Promise.all(
    collections.map(async ({ address, symbol }) => {
      try {
        for (const query of [symbol, address]) {
          const res = await fetch(
            `https://api-mainnet.magiceden.dev/v2/collections/${query}/stats`,
            {
              cache: "no-store",
              signal: AbortSignal.timeout(5000),
            }
          );
          if (!res.ok) continue;

          const data = await res.json();
          if (data.floorPrice) {
            floors[address] = data.floorPrice / 1e9;
            break;
          }
        }
      } catch {
        // Ignore per-collection failures and continue.
      }
    })
  );

  for (const [address, floor] of Object.entries(TENSOR_ONLY_FLOORS)) {
    if (!floors[address]) {
      floors[address] = floor;
    }
  }

  const zmbMain = floors["89Xwuah6o9Y2q91EREgsc1wKeFHYyfXEZKqPFRBNrfhv"];
  if (zmbMain) {
    for (const address of [
      "DGygonz7pn6AFrb1nUUyH3Bu5SVuuCSu38AZWT1cAC4B",
      "DF9oV9ZeUPRh3XUS5opiivRHn9HjqW4kUxD6k1tK8Bqf",
      "DC1vqfCoZbZT2jS6NDv1LAL4W3RvLKW5RPZfs13AhbsH",
    ]) {
      floors[address] = zmbMain;
    }
  }

  cache = { data: floors, timestamp: Date.now() };
  return { floors, collections };
}

export async function GET() {
  try {
    const { floors, collections } = await fetchFloorPrices();

    return NextResponse.json({
      ok: true,
      floors,
      collections: Object.fromEntries(
        collections.map(({ address, name }) => [
          address,
          { name, floor: floors[address] || 0 },
        ])
      ),
      timestamp: Date.now(),
    });
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: err?.message || "Failed to fetch floor prices" },
      { status: 500 }
    );
  }
}

export const maxDuration = 30;
