import { NextResponse } from "next/server";

import { getFloorPriceSnapshot } from "@/lib/server/floor-prices";

interface FloorPricesRouteResponse {
  ok: true;
  floors: Record<string, number>;
  collections: Record<string, { name: string; floor: number }>;
  timestamp: number;
}

interface FloorPricesRouteErrorResponse {
  ok: false;
  error: string;
}

export async function GET() {
  try {
    const snapshot = await getFloorPriceSnapshot();

    return NextResponse.json<FloorPricesRouteResponse>({
      ok: true,
      floors: snapshot.floors,
      collections: snapshot.collections,
      timestamp: snapshot.timestamp,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to fetch floor prices";

    return NextResponse.json(
      { ok: false, error: message } satisfies FloorPricesRouteErrorResponse,
      { status: 500 }
    );
  }
}

export const maxDuration = 30;
