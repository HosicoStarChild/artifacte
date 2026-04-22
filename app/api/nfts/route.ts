import { unstable_rethrow } from "next/navigation";
import { NextRequest, NextResponse } from "next/server";

import { address } from "@solana/kit";

import { parseOwnerAddress } from "@/app/api/_lib/list-route-utils";
import { getDigitalArtOwnedNfts } from "@/app/digital-art/_lib/server-data";

function parseCollectionAddresses(searchParams: URLSearchParams): string[] {
  const rawValues = searchParams
    .getAll("collection")
    .flatMap((value) => value.split(","))
    .map((value) => value.trim())
    .filter(Boolean);

  return Array.from(new Set(rawValues.map((value) => `${address(value)}`)));
}

export async function GET(request: NextRequest) {
  try {
    const owner = parseOwnerAddress(request.nextUrl.searchParams.get("owner"));
    const collectionAddresses = parseCollectionAddresses(request.nextUrl.searchParams);
    const nfts = await getDigitalArtOwnedNfts(owner, collectionAddresses);

    return NextResponse.json(
      { nfts, total: nfts.length },
      {
        headers: {
          "Cache-Control": "private, no-store",
        },
      }
    );
  } catch (error) {
    unstable_rethrow(error);
    const message = error instanceof Error ? error.message : "Failed to fetch NFTs";
    const status = message.startsWith("Missing") || message.startsWith("Invalid") ? 400 : 500;

    if (status === 500) {
      console.error("[nfts]", error);
    }

    return NextResponse.json({ error: message }, { status });
  }
}
