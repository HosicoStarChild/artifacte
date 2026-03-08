import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    
    // TODO: Use 8004-solana SDK server-side for feedback
    return NextResponse.json({ error: 'Feedback requires wallet signing — coming soon' }, { status: 501 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
