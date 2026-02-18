import { NextRequest, NextResponse } from "next/server";

const BOT_API = process.env.LISTING_BOT_API || "http://localhost:4444";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const res = await fetch(`${BOT_API}/event`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    return NextResponse.json(data);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
