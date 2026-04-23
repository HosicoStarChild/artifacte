const DIRECT_IMAGE_HOSTS = new Set([
  "images.unsplash.com",
  "picsum.photos",
  "d1xpxki1g4htqu.cloudfront.net",
]);

const PROXIED_IMAGE_HOSTS = new Set([
  "arweave.net",
  "gateway.irys.xyz",
  "ar-io.dev",
]);

export function resolveHomeImageSrc(src: string | undefined): string | null {
  if (!src) {
    return null;
  }

  if (src.startsWith("/") || src.startsWith("data:")) {
    return src;
  }

  try {
    const parsedUrl = new URL(src);

    if (PROXIED_IMAGE_HOSTS.has(parsedUrl.hostname) || parsedUrl.hostname.endsWith(".ar-io.dev")) {
      return `/api/img-proxy?url=${encodeURIComponent(src)}`;
    }

    if (DIRECT_IMAGE_HOSTS.has(parsedUrl.hostname)) {
      return src;
    }

    return `/api/img-proxy?url=${encodeURIComponent(src)}`;
  } catch {
    return src;
  }
}