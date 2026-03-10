import { NextResponse } from 'next/server';

// Map collection addresses to ME symbols
const COLLECTION_MAP: Record<string, { symbol: string; name: string }> = {
  'J1S9H3QjnRtBbbuD4HjPV6RpRhwuk4zKbxsnCHuTgh9w': { symbol: 'mad_lads', name: 'Mad Lads' },
  '8Rt3Ayqth4DAiPnW9MDFi63TiQJHmohfTWLMQFHi4KZH': { symbol: 'smb_gen3', name: 'SMB Gen3' },
  'SMBtHCCC6RYRutFEPb4gZqeBLUZbMNhRKaMKZZLHi7W': { symbol: 'solana_monkey_business', name: 'SMB Gen2' },
  'BUjZjAS2vbbb65g7Z1Ca9ZRVYoJscURG5L3AkVvHP9ac': { symbol: 'famous_fox_federation', name: 'Famous Fox Federation' },
  '6mszaj17KSfVqADrQj3o4W3zoLMTykgmV37W4QadCczK': { symbol: 'claynosaurz', name: 'Claynosaurz' },
  'HJx4HRAT3RiFq7cy9fSrvP92usAmJ7bJgPccQTyroT2r': { symbol: 'taiyo_robotics', name: 'Taiyo Robotics' },
  '1yPMtWU5aqcF72RdyRD5yipmcMRC8NGNK59NvYubLkZ': { symbol: 'saga', name: 'Claynosaurz: Call of Saga' },
  'J6RJFQfLgBTcoAt3KoZFiTFW9AbufsztBNDgZ7Znrp1Q': { symbol: 'galactic_geckos', name: 'Galactic Gecko' },
  'CjL5WpAmf4cMEEGwZGTfTDKWok9a92ykq9aLZrEK2D5H': { symbol: 'littleswagworld', name: 'little swag world' },
  'BuAYoZPVwQw4AfeEpHTx6iGPbQtB27W7tJUjgyLzgiko': { symbol: 'quekz', name: 'Quekz' },
  '2hwTMM3uWRvNny8YxSEKQkHZ8NHB5BRv7f35ccMWg1ay': { symbol: 'quekz', name: 'Quekz' },
};

// Tensor-only collections (not on ME) — manually updated floors
const TENSOR_ONLY_FLOORS: Record<string, number> = {
  'BuAYoZPVwQw4AfeEpHTx6iGPbQtB27W7tJUjgyLzgiko': 0.45, // Quekz (old)
  '2hwTMM3uWRvNny8YxSEKQkHZ8NHB5BRv7f35ccMWg1ay': 0.45, // Quekz (WNS)
};

// Cache floor prices for 15 minutes
let cache: { data: Record<string, number>; timestamp: number } | null = null;
const CACHE_TTL = 15 * 60 * 1000;

async function fetchFloorPrices(): Promise<Record<string, number>> {
  if (cache && Date.now() - cache.timestamp < CACHE_TTL) {
    return cache.data;
  }

  const floors: Record<string, number> = {};

  await Promise.all(
    Object.entries(COLLECTION_MAP).map(async ([address, { symbol }]) => {
      try {
        const res = await fetch(
          `https://api-mainnet.magiceden.dev/v2/collections/${symbol}/stats`,
          { signal: AbortSignal.timeout(5000) }
        );
        if (res.ok) {
          const data = await res.json();
          if (data.floorPrice) {
            floors[address] = data.floorPrice / 1e9; // lamports to SOL
          }
        }
      } catch {
        // Skip failed collections
      }
    })
  );

  // Add Tensor-only floors as fallback
  for (const [addr, floor] of Object.entries(TENSOR_ONLY_FLOORS)) {
    if (!floors[addr]) floors[addr] = floor;
  }

  cache = { data: floors, timestamp: Date.now() };
  return floors;
}

export async function GET() {
  try {
    const floors = await fetchFloorPrices();

    return NextResponse.json({
      ok: true,
      floors,
      collections: Object.fromEntries(
        Object.entries(COLLECTION_MAP).map(([addr, { name }]) => [
          addr,
          { name, floor: floors[addr] || 0 },
        ])
      ),
      timestamp: Date.now(),
    });
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: err?.message },
      { status: 500 }
    );
  }
}

export const maxDuration = 30;
