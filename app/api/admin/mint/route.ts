import { NextResponse } from "next/server";
import { isAdminWallet } from "@/lib/admin";

const ADMIN_SECRET = process.env.ADMIN_SECRET;

// Store metadata temporarily for minting (in production, upload to Arweave)
const metadataStore = new Map<string, any>();

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { action, adminWallet, adminSecret } = body;

    // Auth required for all mint actions
    if (!ADMIN_SECRET || !isAdminWallet(adminWallet) || adminSecret !== ADMIN_SECRET) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (action === "store-metadata") {
      // Store metadata JSON and return a temporary URI
      const { metadata } = body;
      const id = crypto.randomUUID();
      metadataStore.set(id, metadata);
      
      // Return the URI that points to our metadata endpoint
      const url = new URL(req.url);
      const baseUrl = `${url.protocol}//${url.host}`;
      const uri = `${baseUrl}/api/admin/mint?id=${id}`;
      
      return NextResponse.json({ uri, id });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  
  if (!id || !metadataStore.has(id)) {
    return NextResponse.json({ error: "Metadata not found" }, { status: 404 });
  }

  return NextResponse.json(metadataStore.get(id), {
    headers: { "Cache-Control": "public, max-age=31536000" },
  });
}
