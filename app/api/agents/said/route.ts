import { NextRequest, NextResponse } from "next/server";

// Rate limiting storage (in production, use Redis or database)
const rateLimitMap = new Map<string, { count: number; resetTime: number }>();

// Rate limiting: 10 requests per minute per IP
const RATE_LIMIT = 10;
const RATE_WINDOW = 60 * 1000; // 1 minute in milliseconds

function getClientIP(request: NextRequest): string {
  const forwarded = request.headers.get("x-forwarded-for");
  const realIP = request.headers.get("x-real-ip");
  
  if (forwarded) {
    return forwarded.split(",")[0].trim();
  }
  
  if (realIP) {
    return realIP;
  }
  
  return "unknown";
}

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const clientData = rateLimitMap.get(ip);
  
  if (!clientData || now > clientData.resetTime) {
    // Reset or create new entry
    rateLimitMap.set(ip, { count: 1, resetTime: now + RATE_WINDOW });
    return true;
  }
  
  if (clientData.count >= RATE_LIMIT) {
    return false;
  }
  
  clientData.count++;
  return true;
}

export async function GET(request: NextRequest) {
  const clientIP = getClientIP(request);
  
  if (!checkRateLimit(clientIP)) {
    return NextResponse.json(
      { error: "Rate limit exceeded. Try again later." },
      { status: 429 }
    );
  }

  const { searchParams } = new URL(request.url);
  const action = searchParams.get("action");
  const wallet = searchParams.get("wallet");

  if (!action || !wallet) {
    return NextResponse.json(
      { error: "Missing action or wallet parameter" },
      { status: 400 }
    );
  }

  try {
    let url: string;
    
    switch (action) {
      case "status":
        url = `https://api.saidprotocol.com/api/verify/${wallet}`;
        break;
      case "passport":
        url = `https://api.saidprotocol.com/api/agents/${wallet}/passport`;
        break;
      default:
        return NextResponse.json(
          { error: "Invalid action. Use 'status' or 'passport'" },
          { status: 400 }
        );
    }

    const response = await fetch(url, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": "Artifacte/1.0",
      },
      // Add timeout
      signal: AbortSignal.timeout(10000), // 10 seconds
    });

    const data = await response.json();
    
    // Return SAID response as-is
    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    console.error("SAID API error:", error);
    
    if (error instanceof Error) {
      if (error.name === "AbortError") {
        return NextResponse.json(
          { error: "SAID API timeout" },
          { status: 504 }
        );
      }
    }
    
    return NextResponse.json(
      { error: "Failed to connect to SAID Protocol" },
      { status: 502 }
    );
  }
}

export async function POST(request: NextRequest) {
  const clientIP = getClientIP(request);
  
  if (!checkRateLimit(clientIP)) {
    return NextResponse.json(
      { error: "Rate limit exceeded. Try again later." },
      { status: 429 }
    );
  }

  try {
    const body = await request.json();
    const { action, wallet, name, description } = body;

    if (!action) {
      return NextResponse.json(
        { error: "Missing action parameter" },
        { status: 400 }
      );
    }

    let url: string;
    let payload: any;

    switch (action) {
      case "register":
        if (!wallet || !name || !description) {
          return NextResponse.json(
            { error: "Missing required fields: wallet, name, description" },
            { status: 400 }
          );
        }
        
        url = "https://api.saidprotocol.com/api/agents/register";
        payload = { wallet, name, description };
        break;
        
      case "status":
        if (!wallet) {
          return NextResponse.json(
            { error: "Missing wallet parameter" },
            { status: 400 }
          );
        }
        
        url = `https://api.saidprotocol.com/api/verify/${wallet}`;
        // For status check, we use GET method
        const statusResponse = await fetch(url, {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
            "User-Agent": "Artifacte/1.0",
          },
          signal: AbortSignal.timeout(10000),
        });
        
        const statusData = await statusResponse.json();
        return NextResponse.json(statusData, { status: statusResponse.status });
        
      case "passport":
        if (!wallet) {
          return NextResponse.json(
            { error: "Missing wallet parameter" },
            { status: 400 }
          );
        }
        
        url = `https://api.saidprotocol.com/api/agents/${wallet}/passport`;
        // For passport check, we use GET method
        const passportResponse = await fetch(url, {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
            "User-Agent": "Artifacte/1.0",
          },
          signal: AbortSignal.timeout(10000),
        });
        
        const passportData = await passportResponse.json();
        return NextResponse.json(passportData, { status: passportResponse.status });
        
      default:
        return NextResponse.json(
          { error: "Invalid action. Use 'register', 'status', or 'passport'" },
          { status: 400 }
        );
    }

    // Only for register action, we make a POST request
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": "Artifacte/1.0",
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(10000), // 10 seconds
    });

    const data = await response.json();
    
    // Return SAID response as-is
    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    console.error("SAID API error:", error);
    
    if (error instanceof Error) {
      if (error.name === "AbortError") {
        return NextResponse.json(
          { error: "SAID API timeout" },
          { status: 504 }
        );
      }
    }
    
    return NextResponse.json(
      { error: "Failed to connect to SAID Protocol" },
      { status: 502 }
    );
  }
}