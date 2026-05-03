import { resolveHomeImageSrc } from "./home-image";

interface ResolvableHeliusAssetFile {
  uri?: string;
  cdn_uri?: string;
  mime?: string;
}

interface ResolvableHeliusAssetContent {
  files?: ResolvableHeliusAssetFile[];
  links?: {
    image?: string;
  };
}

export interface ResolvableHeliusAsset {
  id?: string;
  image?: string;
  content?: ResolvableHeliusAssetContent;
}

interface ResolveHeliusAssetImageOptions {
  fallbackMint?: string;
}

interface HeliusImageCdnOptions {
  quality?: number;
  width?: number;
}

const HELIUS_IMAGE_CDN_BASE = "https://cdn.helius-rpc.com/cdn-cgi/image";

const IMAGE_FILE_URI_PATTERN = /\.(avif|gif|jpe?g|png|svg|webp)(\?|$)/i;

function normalizeAssetImageUri(value: string | undefined): string | null {
  const normalized = value?.trim();

  if (!normalized || normalized.startsWith("data:")) {
    return null;
  }

  if (normalized.startsWith("ipfs://")) {
    return normalized.replace("ipfs://", "https://nftstorage.link/ipfs/");
  }

  return normalized;
}

function resolveAssetImageUri(value: string | undefined): string | null {
  const normalized = normalizeAssetImageUri(value);

  if (!normalized) {
    return null;
  }

  return resolveHomeImageSrc(normalized) ?? normalized;
}

function getFirstImageFileUri(files: readonly ResolvableHeliusAssetFile[]): string | undefined {
  return files.find((file) => {
    const normalizedUri = file.uri?.trim();

    if (!normalizedUri) {
      return false;
    }

    return Boolean(
      file.mime?.startsWith("image/") || IMAGE_FILE_URI_PATTERN.test(normalizedUri)
    );
  })?.uri;
}

export function buildNftImageFallbackPath(mint: string): string {
  return `/api/nft-image?mint=${encodeURIComponent(mint)}`;
}

export function buildHeliusImageCdnUrl(
  source: string | null | undefined,
  options: HeliusImageCdnOptions = {}
): string | null {
  const normalizedSource = source?.trim();
  if (!normalizedSource || normalizedSource.startsWith("/") || normalizedSource.startsWith("data:")) {
    return normalizedSource || null;
  }

  let parsedSource: URL;
  try {
    parsedSource = new URL(normalizedSource);
  } catch {
    return normalizedSource;
  }

  if (!parsedSource.protocol.startsWith("http")) {
    return normalizedSource;
  }

  if (parsedSource.hostname === "cdn.helius-rpc.com" && parsedSource.pathname.startsWith("/cdn-cgi/image/")) {
    return normalizedSource;
  }

  const transforms = [
    options.width ? `width=${Math.round(options.width)}` : null,
    options.quality ? `quality=${Math.round(options.quality)}` : null,
    "format=auto",
  ].filter(Boolean).join(",");

  return `${HELIUS_IMAGE_CDN_BASE}/${transforms}/${normalizedSource}`;
}

export function resolveHeliusAssetImageSrc(
  asset: ResolvableHeliusAsset | null | undefined,
  options: ResolveHeliusAssetImageOptions = {}
): string | null {
  const files = asset?.content?.files ?? [];
  const cdnUri = files.find((file) => {
    const normalizedUri = file.cdn_uri?.trim();

    return Boolean(normalizedUri && normalizedUri.length > 40 && !normalizedUri.endsWith("//"));
  })?.cdn_uri;

  const resolvedCdnUri = resolveAssetImageUri(cdnUri);
  if (resolvedCdnUri) {
    return resolvedCdnUri;
  }

  const resolvedPrimaryUri = resolveAssetImageUri(
    asset?.content?.links?.image || asset?.image
  );
  if (resolvedPrimaryUri) {
    return resolvedPrimaryUri;
  }

  const resolvedFileUri = resolveAssetImageUri(getFirstImageFileUri(files));
  if (resolvedFileUri) {
    return resolvedFileUri;
  }

  const fallbackMint = options.fallbackMint || asset?.id?.trim();
  return fallbackMint ? buildNftImageFallbackPath(fallbackMint) : null;
}
