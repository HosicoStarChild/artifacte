import "server-only";

import {
  getCollectionAddress,
  readCuratedCollections,
} from "@/app/lib/digital-art-marketplaces";
import type { AllowlistEntry } from "@/lib/allowlist";
import type { FloorPriceCollection } from "@/lib/portfolio";

interface FloorCollectionConfig {
  address: string;
  name: string;
  symbol: string;
}

interface MagicEdenCollectionStats {
  floorPrice?: number | null;
}

export interface FloorPriceSnapshot {
  floors: Record<string, number>;
  collections: Record<string, FloorPriceCollection>;
  timestamp: number;
}

const TENSOR_ONLY_FLOORS: Record<string, number> = {
  BuAYoZPVwQw4AfeEpHTx6iGPbQtB27W7tJUjgyLzgiko: 0.45,
  "2hwTMM3uWRvNny8YxSEKQkHZ8NHB5BRv7f35ccMWg1ay": 0.45,
  DGygonz7pn6AFrb1nUUyH3Bu5SVuuCSu38AZWT1cAC4B: 1.29,
  DF9oV9ZeUPRh3XUS5opiivRHn9HjqW4kUxD6k1tK8Bqf: 1.29,
  DC1vqfCoZbZT2jS6NDv1LAL4W3RvLKW5RPZfs13AhbsH: 1.29,
};

const CACHE_TTL = 15 * 60 * 1000;

let cache: FloorPriceSnapshot | null = null;

function getMagicEdenCollections(entries: AllowlistEntry[]): FloorCollectionConfig[] {
  return entries
    .map((entry) => {
      const address = getCollectionAddress(entry);
      const symbol = entry.marketplaces?.magicEden?.symbol;

      if (!address || !symbol) {
        return null;
      }

      return {
        address,
        name: entry.name,
        symbol,
      };
    })
    .filter((entry): entry is FloorCollectionConfig => entry !== null);
}

async function fetchMagicEdenFloorPrice(collection: FloorCollectionConfig): Promise<number> {
  for (const query of [collection.symbol, collection.address]) {
    try {
      const response = await fetch(
        `https://api-mainnet.magiceden.dev/v2/collections/${query}/stats`,
        {
          cache: "no-store",
          signal: AbortSignal.timeout(5000),
        }
      );

      if (!response.ok) {
        continue;
      }

      const payload = (await response.json()) as MagicEdenCollectionStats;
      const floorPrice = payload.floorPrice;

      if (typeof floorPrice === "number" && Number.isFinite(floorPrice) && floorPrice > 0) {
        return floorPrice / 1e9;
      }
    } catch {
      continue;
    }
  }

  return 0;
}

export async function getFloorPriceSnapshot(): Promise<FloorPriceSnapshot> {
  if (cache && Date.now() - cache.timestamp < CACHE_TTL) {
    return cache;
  }

  const collections = getMagicEdenCollections(await readCuratedCollections());
  const floorEntries = await Promise.all(
    collections.map(async (collection) => {
      const floor = await fetchMagicEdenFloorPrice(collection);
      return [collection.address, floor] as const;
    })
  );

  const floors = Object.fromEntries(
    floorEntries.filter(([, floor]) => floor > 0)
  ) as Record<string, number>;

  for (const [address, floor] of Object.entries(TENSOR_ONLY_FLOORS)) {
    if (!floors[address]) {
      floors[address] = floor;
    }
  }

  const zmbMainFloor = floors["89Xwuah6o9Y2q91EREgsc1wKeFHYyfXEZKqPFRBNrfhv"];
  if (zmbMainFloor) {
    for (const address of [
      "DGygonz7pn6AFrb1nUUyH3Bu5SVuuCSu38AZWT1cAC4B",
      "DF9oV9ZeUPRh3XUS5opiivRHn9HjqW4kUxD6k1tK8Bqf",
      "DC1vqfCoZbZT2jS6NDv1LAL4W3RvLKW5RPZfs13AhbsH",
    ]) {
      floors[address] = zmbMainFloor;
    }
  }

  const snapshot: FloorPriceSnapshot = {
    floors,
    collections: Object.fromEntries(
      collections.map(({ address, name }) => [
        address,
        { name, floor: floors[address] ?? 0 },
      ])
    ) as Record<string, FloorPriceCollection>,
    timestamp: Date.now(),
  };

  cache = snapshot;
  return snapshot;
}