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

export function resolveHeliusAssetImageSrc(
  asset: ResolvableHeliusAsset | null | undefined,
  options: ResolveHeliusAssetImageOptions = {}
): string | null {
  const files = asset?.content?.files ?? [];
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

  const cdnUri = files.find((file) => {
    const normalizedUri = file.cdn_uri?.trim();

    return Boolean(normalizedUri && normalizedUri.length > 40 && !normalizedUri.endsWith("//"));
  })?.cdn_uri;

  const resolvedCdnUri = resolveAssetImageUri(cdnUri);
  if (resolvedCdnUri) {
    return resolvedCdnUri;
  }

  const fallbackMint = options.fallbackMint || asset?.id?.trim();
  return fallbackMint ? buildNftImageFallbackPath(fallbackMint) : null;
}