import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  try {
    const asset = request.nextUrl.searchParams.get('asset');
    if (!asset) return NextResponse.json({ error: 'asset required' }, { status: 400 });

    // TODO: Use 8004-solana SDK server-side
    // const { SolanaSDK } = await import('8004-solana');
    // const sdk = new SolanaSDK();
    // const agent = await sdk.loadAgent(new PublicKey(asset));

    return NextResponse.json({ error: 'Not yet implemented' }, { status: 501 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
