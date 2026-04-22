import { NextRequest, NextResponse } from "next/server";

// Rate limiting storage (in production, use Redis or database)
const rateLimitMap = new Map<string, { count: number; resetTime: number }>();

// Rate limiting: 10 requests per minute per IP
const RATE_LIMIT = 10;
const RATE_WINDOW = 60 * 1000; // 1 minute in milliseconds
const SAID_USER_AGENT = "Artifacte/1.0"

type SaidJsonValue =
  | boolean
  | null
  | number
  | string
  | SaidJsonValue[]
  | { [key: string]: SaidJsonValue }

type SaidJsonResponse = { [key: string]: SaidJsonValue }

type SaidLookupAction = "passport" | "status"
type SaidAction = "register" | SaidLookupAction

interface SaidPostBody {
  action?: SaidAction
  description?: string
  name?: string
  wallet?: string
}

interface SaidRegisterPayload {
  description: string
  name: string
  wallet: string
}

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

function getSaidLookupUrl(action: SaidLookupAction, wallet: string): string {
  switch (action) {
    case "passport":
      return `https://api.saidprotocol.com/api/agents/${wallet}/passport`
    case "status":
      return `https://api.saidprotocol.com/api/verify/${wallet}`
  }
}

function getSaidHeaders(): HeadersInit {
  return {
    "Content-Type": "application/json",
    "User-Agent": SAID_USER_AGENT,
  }
}

async function fetchSaidResponse(
  url: string,
  init: RequestInit
): Promise<Response> {
  return fetch(url, {
    ...init,
    headers: {
      ...getSaidHeaders(),
      ...(init.headers ?? {}),
    },
    signal: AbortSignal.timeout(10000),
  })
}

async function readSaidJson(response: Response): Promise<SaidJsonResponse> {
  return (await response.json()) as SaidJsonResponse
}

async function proxySaidLookup(action: SaidLookupAction, wallet: string) {
  const response = await fetchSaidResponse(getSaidLookupUrl(action, wallet), {
    method: "GET",
  })
  const data = await readSaidJson(response)

  return NextResponse.json(data, { status: response.status })
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
    switch (action) {
      case "status":
        return proxySaidLookup("status", wallet)
      case "passport":
        return proxySaidLookup("passport", wallet)
      default:
        return NextResponse.json(
          { error: "Invalid action. Use 'status' or 'passport'" },
          { status: 400 }
        );
    }

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
    const body = (await request.json()) as SaidPostBody
    const { action, wallet, name, description } = body;

    if (!action) {
      return NextResponse.json(
        { error: "Missing action parameter" },
        { status: 400 }
      );
    }

    switch (action) {
      case "register":
        if (!wallet || !name || !description) {
          return NextResponse.json(
            { error: "Missing required fields: wallet, name, description" },
            { status: 400 }
          );
        }
        break;
        
      case "status":
        if (!wallet) {
          return NextResponse.json(
            { error: "Missing wallet parameter" },
            { status: 400 }
          );
        }
        return proxySaidLookup("status", wallet)
        
      case "passport":
        if (!wallet) {
          return NextResponse.json(
            { error: "Missing wallet parameter" },
            { status: 400 }
          );
        }
        return proxySaidLookup("passport", wallet)
        
      default:
        return NextResponse.json(
          { error: "Invalid action. Use 'register', 'status', or 'passport'" },
          { status: 400 }
        );
    }

    const payload: SaidRegisterPayload = {
      description,
      name,
      wallet,
    }

    const response = await fetchSaidResponse(
      "https://api.saidprotocol.com/api/register/pending",
      {
      method: "POST",
      body: JSON.stringify(payload),
      }
    )

    const data = await readSaidJson(response)

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