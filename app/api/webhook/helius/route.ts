import { NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";

// Helius webhook — receives real-time NFT marketplace events for CC collection
// Events: NFT_LISTING, NFT_SALE, NFT_CANCEL_LISTING, NFT_BID, NFT_BID_CANCELLED

export const maxDuration = 10;

// In-memory listing cache (updated by webhook, read by /api/me-listings)
// In production this would be Redis/DB, but for now we use revalidation
const WEBHOOK_SECRET = process.env.HELIUS_WEBHOOK_SECRET || "";

export async function POST(req: NextRequest) {
  try {
    // Verify webhook auth token
    const authHeader = req.headers.get("authorization");
    if (WEBHOOK_SECRET && authHeader !== `Bearer ${WEBHOOK_SECRET}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const events = Array.isArray(body) ? body : [body];

    let listingChanges = 0;
    let salesCount = 0;

    for (const event of events) {
      const type = event.type;
      const desc = event.description || "";

      if (type === "NFT_LISTING" || type === "NFT_CANCEL_LISTING") {
        listingChanges++;
      } else if (type === "NFT_SALE") {
        salesCount++;
      }

      // Log for debugging
      console.log(
        `[helius-webhook] ${type} | ${event.source || "unknown"} | ${desc.slice(0, 100)}`
      );
    }

    // Trigger revalidation of listing data when listings change
    if (listingChanges > 0 || salesCount > 0) {
      try {
        revalidateTag("me-listings");
      } catch {
        // revalidateTag may not work in all contexts
      }
    }

    return NextResponse.json({
      ok: true,
      processed: events.length,
      listingChanges,
      sales: salesCount,
    });
  } catch (err: any) {
    console.error("[helius-webhook] Error:", err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// Helius sends a GET to verify the webhook URL
export async function GET() {
  return NextResponse.json({ status: "ok", service: "artifacte-helius-webhook" });
}
