import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const body = await req.json();
  
  const res = await fetch("https://mainnet.helius-rpc.com/?api-key=345726df-3822-42c1-86e0-1a13dc6c7a04", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  
  const data = await res.json();
  return NextResponse.json(data);
}
