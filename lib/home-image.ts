const DIRECT_IMAGE_HOSTS = new Set([
  "images.unsplash.com",
  "picsum.photos",
  "d1xpxki1g4htqu.cloudfront.net",
  "arweave.net",
  "gateway.irys.xyz",
  "ar-io.dev",
  "nftstorage.link",
  "dweb.link",
  "w3s.link",
  "cloudflare-ipfs.com",
]);

function shouldUseImageProxy(hostname: string, src: string): boolean {
  return (
    hostname === "arweave.net" ||
    hostname === "www.arweave.net" ||
    hostname === "gateway.irys.xyz" ||
    hostname.endsWith(".ar-io.dev") ||
    src.includes("/ipfs/") ||
    hostname.endsWith(".ipfs.nftstorage.link") ||
    hostname.endsWith(".ipfs.dweb.link") ||
    hostname.endsWith(".ipfs.w3s.link") ||
    hostname.endsWith(".mypinata.cloud")
  );
}

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

    if (shouldUseImageProxy(hostname, src)) {
      return `/api/img-proxy?url=${encodeURIComponent(src)}`;
    }

    if (DIRECT_IMAGE_HOSTS.has(hostname) || isIpfsSubdomain) {
      return src;
    }

    return src;
  } catch {
    return src;
  }
}
