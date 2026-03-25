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
  'CywHUY59AFi7nmGf9kVfNgd39TD9rnkyx6GfWsn5iNnE': { symbol: 'hot_heads', name: 'Hot Heads' },
  '6XxjKYFbcndh2gDcsUrmZgVEsoDxXMnfsaGY6fpTJzNr': { symbol: 'degods', name: 'DeGods' },
  'DSwfRF1jhhu6HpSuzaig1G19kzP73PfLZBPLofkw6fLD': { symbol: 'degen_ape_academy', name: 'Degen Ape Academy' },
  'GMoemLuVAksjvGph8dmujuqijWsodt7nJsvwoMph3uzj': { symbol: 'sensei', name: 'Sensei' },
  '7LxjzYdvXXDMxEmjS3aBC26ut4FMtDUae44nkHBPNVWP': { symbol: '7LxjzYdvXXDMxEmjS3aBC26ut4FMtDUae44nkHBPNVWP', name: 'Dead King Society' },
  '3saAedkM9o5g1u5DCqsuMZuC4GRqPB4TuMkvSsSVvGQ3': { symbol: 'okay_bears', name: 'Okay Bears' },
  '7cHTjqr2S8uUCrG3TVFvFix3vcLjhPiwrtRsAeJtESRj': { symbol: 'drifella2', name: 'Drifella 2' },
  'ArqtvxDZ1nfWgnGiHYCFTLj4FSVuyf7tmkAetQ9SScyQ': { symbol: 'drifella_iii', name: 'Drifella III' },
  '8vE4uASPp9WbS9Ls2qzJ9fpUBpR3UrTG3hBZXdAJQ9mz': { symbol: 'monkey_baby_business', name: 'Monkey Baby Business' },
  '89Xwuah6o9Y2q91EREgsc1wKeFHYyfXEZKqPFRBNrfhv': { symbol: 'zmb_0735', name: 'ZMB' },
};

// Tensor-only collections (not on ME) — manually updated floors
const TENSOR_ONLY_FLOORS: Record<string, number> = {
  'BuAYoZPVwQw4AfeEpHTx6iGPbQtB27W7tJUjgyLzgiko': 0.45, // Quekz (old)
  '2hwTMM3uWRvNny8YxSEKQkHZ8NHB5BRv7f35ccMWg1ay': 0.45, // Quekz (WNS)
  'DGygonz7pn6AFrb1nUUyH3Bu5SVuuCSu38AZWT1cAC4B': 1.29, // ZMB Wave 1 (mirrors main ZMB floor)
  'DF9oV9ZeUPRh3XUS5opiivRHn9HjqW4kUxD6k1tK8Bqf': 1.29, // ZMB Wave 2
  'DC1vqfCoZbZT2jS6NDv1LAL4W3RvLKW5RPZfs13AhbsH': 1.29, // ZMB Wave 3
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

  // ZMB waves mirror main ZMB floor
  const zmbMain = floors['89Xwuah6o9Y2q91EREgsc1wKeFHYyfXEZKqPFRBNrfhv'];
  if (zmbMain) {
    for (const addr of ['DGygonz7pn6AFrb1nUUyH3Bu5SVuuCSu38AZWT1cAC4B', 'DF9oV9ZeUPRh3XUS5opiivRHn9HjqW4kUxD6k1tK8Bqf', 'DC1vqfCoZbZT2jS6NDv1LAL4W3RvLKW5RPZfs13AhbsH']) {
      floors[addr] = zmbMain;
    }
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
