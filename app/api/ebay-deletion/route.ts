import { NextRequest, NextResponse } from "next/server";

// eBay Marketplace Account Deletion webhook
// Required for API compliance — we don't store eBay user data,
// so this just acknowledges the request.

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    console.log("eBay deletion notification received:", JSON.stringify(body));
    
    // Acknowledge the request
    return NextResponse.json({ 
      status: "OK",
      message: "Deletion request acknowledged. No user data stored." 
    }, { status: 200 });
  } catch {
    return NextResponse.json({ status: "OK" }, { status: 200 });
  }
}

// eBay sends a challenge for verification
export async function GET(req: NextRequest) {
  const challengeCode = req.nextUrl.searchParams.get("challenge_code");
  if (challengeCode) {
    // eBay verification challenge — echo back the challenge code
    // In production, this should be hashed with your verification token
    const crypto = await import("crypto");
    const verificationToken = process.env.EBAY_VERIFICATION_TOKEN;
    if (!verificationToken) {
      return new Response("Server configuration error", { status: 503 });
    }
    const endpoint = "https://artifacte.io/api/ebay-deletion";
    
    const hash = crypto.createHash("sha256");
    hash.update(challengeCode);
    hash.update(verificationToken);
    hash.update(endpoint);
    const responseHash = hash.digest("hex");
    
    return NextResponse.json({ challengeResponse: responseHash }, { 
      status: 200,
      headers: { "Content-Type": "application/json" }
    });
  }
  
  return NextResponse.json({ status: "Endpoint active" }, { status: 200 });
}
