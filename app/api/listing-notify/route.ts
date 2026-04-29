import { NextRequest, NextResponse } from "next/server";

import {
  createRateLimiter,
  getRequestIp,
  jsonError,
  parseListingNotifyRequest,
  withRequestTimeout,
} from "@/app/api/_lib/list-route-utils";
import { invalidateActiveArtifacteFixedPriceListingsCache } from "@/lib/artifacte-listings";
import { getOracleApiUrl } from '@/lib/server/oracle-env';

/**
 * POST /api/listing-notify
 * Called after a successful listing TX to immediately push the NFT into the Oracle index.
 * Body: { mint: string }
 */
const LISTING_NOTIFY_RATE_LIMIT = createRateLimiter(20);

export async function POST(request: NextRequest) {
  try {
    const ip = getRequestIp(request.headers);
    if (!LISTING_NOTIFY_RATE_LIMIT(ip)) {
      return jsonError("Rate limit exceeded.", 429);
    }

    const body = (await request.json()) as Partial<{ mint?: string }>;
    const { mint } = parseListingNotifyRequest(body);

    const ORACLE_URL = getOracleApiUrl();
    const ADMIN_TOKEN = process.env.ORACLE_ADMIN_TOKEN;

    if (!ADMIN_TOKEN) {
      console.warn('[listing-notify] No ORACLE_ADMIN_TOKEN set — skipping');
      return jsonError("Oracle notify is disabled on this deployment.", 503);
    }

    const res = await fetch(`${ORACLE_URL}/api/listings/push`, {
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${ADMIN_TOKEN}`,
      },
      method: 'POST',
      body: JSON.stringify({ mint }),
      signal: withRequestTimeout(),
    });

    const data = (await res.json()) as {
      added?: boolean;
      error?: string;
      ok?: boolean;
      reason?: string;
      skipped?: boolean;
    };

    if (!res.ok) {
      return jsonError(data.error ?? "Failed to notify oracle.", 502);
    }

    if (data.added === false && data.reason !== "already exists") {
      return jsonError(data.reason ?? "Oracle listing push did not add the mint.", 502);
    }

    invalidateActiveArtifacteFixedPriceListingsCache();

    return NextResponse.json({ ok: true, ...data });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to notify oracle.";
    console.error('[listing-notify] Error:', message);
    return jsonError(message, 500);
  }
}
