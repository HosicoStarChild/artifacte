import { NextRequest, NextResponse } from 'next/server';

/**
 * /api/nft-image?mint=...
 * Resolves the image URL for an NFT via Helius and proxies/redirects.
 * Used as fallback when DAS getAssetsByOwner doesn't populate content.links.image.
 */

const HELIUS_RPC = `https://mainnet.helius-rpc.com/?api-key=${process.env.HELIUS_API_KEY}`;

export async function GET(req: NextRequest) {
  const mint = req.nextUrl.searchParams.get('mint');
  if (!mint) return NextResponse.json({ error: 'Missing mint' }, { status: 400 });

  try {
    const res = await fetch(HELIUS_RPC, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'getAsset', params: { id: mint } }),
    });
    const data = await res.json();
    const asset = data.result;

    // Priority: cdn_uri → links.image → files[].uri (skip metadata JSON)
    const cdnUri = asset?.content?.files?.[0]?.cdn_uri;
    if (cdnUri) return NextResponse.redirect(cdnUri);

    let imageUrl = asset?.content?.links?.image || '';
    if (!imageUrl) {
      // Try files — skip the one that looks like a metadata JSON (ends in .json or has no extension)
      const files: { uri?: string; mime?: string }[] = asset?.content?.files || [];
      const imgFile = files.find(f => f.mime?.startsWith('image/') || /\.(png|jpg|jpeg|gif|webp|svg)(\?|$)/i.test(f.uri || ''));
      imageUrl = imgFile?.uri || '';
    }

    if (!imageUrl) return NextResponse.redirect('/placeholder.png');

    // Proxy through img-proxy to handle arweave/IPFS
    const proxyUrl = new URL('/api/img-proxy', req.url);
    proxyUrl.searchParams.set('url', imageUrl);
    return NextResponse.redirect(proxyUrl.toString());
  } catch {
    return NextResponse.redirect('/placeholder.png');
  }
}

export const dynamic = 'force-dynamic';
