import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    
    // TODO: Use 8004-solana SDK server-side for registration
    // This requires the signer to be server-side or transaction to be
    // built server-side and signed client-side
    
    return NextResponse.json({ error: 'Registration requires wallet signing — coming soon' }, { status: 501 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
