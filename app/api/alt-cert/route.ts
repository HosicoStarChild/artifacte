import { NextRequest, NextResponse } from "next/server";

const ALT_GQL_URL = process.env.ALT_GQL_URL || "https://alt-platform-server.production.internal.onlyalt.com/graphql/";
const FETCH_TIMEOUT_MS = 8000;

const CERT_LOOKUP_QUERY = `query CertLookup($cert: String!) {
  cert(certNumber: $cert) {
    certNumber
    gradingCompany
    gradeNumber
    asset {
      id
      name
      category
      brand
      year
      subject
      variety
    }
  }
}`;

interface CertLookupPayload {
  data?: {
    cert?: {
      certNumber?: string;
      gradingCompany?: string;
      gradeNumber?: string;
      asset?: {
        id?: string;
        name?: string;
        category?: string | null;
        brand?: string | null;
        year?: string | null;
        subject?: string | null;
        variety?: string | null;
      } | null;
    } | null;
  };
  errors?: Array<{ message?: string }>;
}

export const maxDuration = 15;

function fetchWithTimeout(url: string, options: RequestInit = {}, timeoutMs: number = FETCH_TIMEOUT_MS): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  return fetch(url, {
    ...options,
    cache: "no-store",
    signal: controller.signal,
  }).finally(() => clearTimeout(timeoutId));
}

function hasCertAsset(payload: CertLookupPayload): boolean {
  const cert = payload.data?.cert;
  return Boolean(cert?.certNumber && cert.gradingCompany && cert.gradeNumber && cert.asset?.id && cert.asset?.name);
}

export async function GET(req: NextRequest) {
  const cert = req.nextUrl.searchParams.get("cert")?.trim();
  if (!cert) {
    return NextResponse.json({ error: "cert query param required" }, { status: 400 });
  }

  try {
    const res = await fetchWithTimeout(ALT_GQL_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        operationName: "CertLookup",
        query: CERT_LOOKUP_QUERY,
        variables: { cert },
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      return NextResponse.json(
        { error: `GraphQL error: ${res.status}`, detail: text.slice(0, 200) },
        { status: 502 }
      );
    }

    const data = (await res.json()) as CertLookupPayload;
    if (data.errors?.length) {
      return NextResponse.json({ error: "GraphQL errors", details: data.errors }, { status: 502 });
    }

    if (!hasCertAsset(data)) {
      return NextResponse.json({ error: "Cert lookup payload missing asset" }, { status: 404 });
    }

    return NextResponse.json(data, {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Cache-Control": "public, max-age=300, s-maxage=300, stale-while-revalidate=60",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const status = error instanceof Error && error.name === "AbortError" ? 504 : 500;
    return NextResponse.json({ error: message || "Failed to fetch Alt cert lookup" }, { status });
  }
}