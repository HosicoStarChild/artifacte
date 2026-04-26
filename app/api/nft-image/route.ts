import { NextRequest, NextResponse } from 'next/server';

import {
  ensureHeliusRpcUrl,
  fetchHeliusRpc,
  type HeliusAssetResponse,
} from '@/app/api/_lib/list-route-utils';

/**
 * /api/nft-image?mint=...
 * Resolves the image URL for an NFT via Helius and proxies/redirects.
 * Used as fallback when DAS getAssetsByOwner doesn't populate content.links.image.
 */
function getPlaceholderImageUrl(request: NextRequest): URL {
  return new URL('/placeholder.png', request.url);
}

export async function GET(req: NextRequest) {
  const mint = req.nextUrl.searchParams.get('mint');
  if (!mint) return NextResponse.json({ error: 'Missing mint' }, { status: 400 });

  try {
    const rpcUrl = ensureHeliusRpcUrl();
    const data = await fetchHeliusRpc<HeliusAssetResponse>(rpcUrl, {
      jsonrpc: '2.0',
      id: 1,
      method: 'getAsset',
      params: { id: mint },
    });
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

    if (!imageUrl) return NextResponse.redirect(getPlaceholderImageUrl(req));

    // Proxy through img-proxy to handle arweave/IPFS
    const proxyUrl = new URL('/api/img-proxy', req.url);
    proxyUrl.searchParams.set('url', imageUrl);
    return NextResponse.redirect(proxyUrl.toString());
  } catch {
    return NextResponse.redirect(getPlaceholderImageUrl(req));
  }
}
