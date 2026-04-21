import { NextRequest, NextResponse } from 'next/server';
import type { JsonValue } from '@/lib/magic-eden-buy';
import {
  buildMagicEdenBuyResponse,
  MagicEdenBuyRouteError,
  parseMagicEdenBuyRequest,
} from '@/lib/server/me-buy';

/**
 * Artifacte ME Proxy Buy API
 * 
 * Supports both M2 (auction house) and M3 (MMM pool) listings.
 * 
 * Flow for M2 (CC cards, pNFTs):
 * 1. Fetch listing → call ME /v2/instructions/buy_now → return cosigned tx
 * 
 * Flow for M3 (Phygitals, cNFTs):
 * 1. Fetch listing → detect M3 (empty auctionHouse)
 * 2. Call ME /v2/instructions/batch with type "m3_buy_now"
 * 3. Return cosigned tx (same format)
 */

// Simple in-memory rate limiter: max 10 requests per minute per IP
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
  entry.count++;
  return true;
}

export async function POST(req: NextRequest) {
  try {
    const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || req.headers.get('x-real-ip') || 'unknown';
    if (!checkRateLimit(ip)) {
      return NextResponse.json({ error: 'Rate limit exceeded. Try again in a minute.' }, { status: 429 });
    }

    const requestBody = parseMagicEdenBuyRequest((await req.json()) as JsonValue);
    const response = await buildMagicEdenBuyResponse(requestBody);
    return NextResponse.json(response);
  } catch (error) {
    if (error instanceof MagicEdenBuyRouteError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    console.error('[me-buy] Error:', error);
    return NextResponse.json({ error: 'Failed to build buy transaction' }, { status: 500 });
  }
}
