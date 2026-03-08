import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  try {
    const asset = request.nextUrl.searchParams.get('asset');
    if (!asset) return NextResponse.json({ error: 'asset required' }, { status: 400 });

    // TODO: Use 8004-solana SDK server-side for ATOM reputation
    return NextResponse.json({ averageScore: 0, totalFeedbacks: 0, trustTier: 0 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
