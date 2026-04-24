import { NextRequest, NextResponse } from "next/server";

import {
  createRateLimiter,
  getRequestIp,
  jsonError,
  withRequestTimeout,
} from "@/app/api/_lib/list-route-utils";

const BOT_API = process.env.LISTING_BOT_API;
const LISTING_EVENT_RATE_LIMIT = createRateLimiter(20);

type ListingEventPayloadValue = boolean | number | string | null;
type ListingEventPayload = Record<string, ListingEventPayloadValue>;

type ListingEventRequestBody = {
  payload?: ListingEventPayload | null;
  type?: string;
};

type ListingEventResponse = {
  error?: string;
  message?: string;
  ok?: boolean;
};

function parseListingEventRequest(body: ListingEventRequestBody) {
  if (!body.type || !/^[A-Z_]{2,40}$/.test(body.type)) {
    throw new Error("Invalid event type.");
  }

  if (!body.payload || Array.isArray(body.payload) || typeof body.payload !== "object") {
    throw new Error("Invalid event payload.");
  }

  const payloadEntries = Object.entries(body.payload as ListingEventPayload);
  if (payloadEntries.length === 0 || payloadEntries.length > 12) {
    throw new Error("Invalid event payload.");
  }

  for (const [key, value] of payloadEntries) {
    if (!/^[a-zA-Z][a-zA-Z0-9_]{0,39}$/.test(key)) {
      throw new Error("Invalid event payload.");
    }

    if (typeof value === "string" && value.length > 300) {
      throw new Error("Invalid event payload.");
    }

    if (value !== null && typeof value !== "boolean" && typeof value !== "number" && typeof value !== "string") {
      throw new Error("Invalid event payload.");
    }
  }

  const maybeLink = body.payload.link;
  if (typeof maybeLink === "string") {
    const parsedUrl = new URL(maybeLink);
    if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
      throw new Error("Invalid event payload.");
    }
  }

  return {
    payload: body.payload,
    type: body.type,
  };
}

export async function POST(req: NextRequest) {
  try {
    const ip = getRequestIp(req.headers);
    if (!LISTING_EVENT_RATE_LIMIT(ip)) {
      return jsonError("Rate limit exceeded.", 429);
    }

    if (!BOT_API) {
      return NextResponse.json({ ok: true, skipped: true });
    }

    const body = (await req.json()) as ListingEventRequestBody;
    const event = parseListingEventRequest(body);
    const response = await fetch(`${BOT_API.replace(/\/+$/, "")}/event`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(event),
      signal: withRequestTimeout(),
    });

    const data = (await response.json().catch(() => ({}))) as ListingEventResponse;
    if (!response.ok) {
      return jsonError(data.error ?? "Failed to notify listing bot.", 502);
    }

    return NextResponse.json({ ok: true, ...data });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to notify listing bot.";
    console.error("[listing-event] Error:", message);
    return jsonError(message, 400);
  }
}
