import { NextRequest, NextResponse } from "next/server";

const BOT_API = process.env.LISTING_BOT_API;

export async function POST(req: NextRequest) {
  try {
    if (!BOT_API) {
      // Bot not configured — silently succeed (don't leak internal config)
      return NextResponse.json({ ok: true, message: "Notification skipped" });
    }
    const body = await req.json();
    const res = await fetch(`${BOT_API}/event`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    return NextResponse.json(data);
  } catch (e: any) {
    // Don't expose internal errors
    return NextResponse.json({ ok: true, message: "Notification skipped" });
  }
}
