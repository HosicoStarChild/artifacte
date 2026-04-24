const DIRECT_IMAGE_HOSTS = new Set([
  "images.unsplash.com",
  "picsum.photos",
  "d1xpxki1g4htqu.cloudfront.net",
]);

const PROXIED_IMAGE_HOSTS = new Set([
  "arweave.net",
  "gateway.irys.xyz",
  "ar-io.dev",
  "nftstorage.link",
  "dweb.link",
  "w3s.link",
  "cloudflare-ipfs.com",
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
    const hostname = parsedUrl.hostname;
    const isIpfsSubdomain =
      hostname.endsWith(".ipfs.nftstorage.link") ||
      hostname.endsWith(".ipfs.dweb.link") ||
      hostname.endsWith(".ipfs.w3s.link") ||
      hostname.endsWith(".mypinata.cloud");

    if (PROXIED_IMAGE_HOSTS.has(hostname) || hostname.endsWith(".ar-io.dev") || isIpfsSubdomain) {
      return `/api/img-proxy?url=${encodeURIComponent(src)}`;
    }

    if (DIRECT_IMAGE_HOSTS.has(hostname)) {
      return src;
    }

    return src;
  } catch {
    return src;
  }
}