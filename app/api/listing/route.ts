import { NextRequest, NextResponse } from "next/server";

const BOT_API = process.env.LISTING_BOT_API || "http://localhost:4444";

const CATEGORY_LABELS: Record<string, string> = {
  DIGITAL_ART: "Digital Art",
  SPIRITS: "Spirits",
  TCG_CARDS: "TCG Cards",
  SPORTS_CARDS: "Sports Cards",
  WATCHES: "Watches",
};

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { name, category, description, value, condition, contact, image, listingType, auctionEnd } = body;

    if (!name || !category || !value) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    // Store listing (in production this would go to a database)
    const listing = {
      id: Date.now().toString(36),
      name,
      category: CATEGORY_LABELS[category] || category,
      description,
      value,
      condition,
      contact,
      image,
      listingType: listingType || "fixed",
      auctionEnd,
      createdAt: new Date().toISOString(),
    };

    // Notify the Telegram bot
    try {
      const price = value.replace(/[^0-9.]/g, "");
      await fetch(`${BOT_API}/event`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "NEW_LISTING",
          payload: {
            name: listing.name,
            category: listing.category,
            price,
            currency: "USD1",
            image: listing.image || undefined,
            auctionEnd: listing.auctionEnd || undefined,
            link: `https://artifacte-five.vercel.app/auctions/${listing.id}`,
          },
        }),
      });
    } catch (botErr) {
      console.error("Bot notification failed:", botErr);
      // Don't fail the listing if bot is down
    }

    return NextResponse.json({ ok: true, listing });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
