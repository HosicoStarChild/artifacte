import { NextRequest, NextResponse } from 'next/server';

// Placeholder — 8004 agent listing will be wired up once collection is created
// For now return empty array so the page renders
export async function GET(request: NextRequest) {
  try {
    // TODO: Use 8004-solana SDK server-side to fetch agents from our collection
    // const { SolanaSDK } = await import('8004-solana');
    // const sdk = new SolanaSDK();
    // const agents = await sdk.getCollectionAgents(collectionPointer);
    
    return NextResponse.json({ agents: [] });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
