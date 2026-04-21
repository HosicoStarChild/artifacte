const DIRECT_IMAGE_HOSTS = new Set(["images.unsplash.com", "picsum.photos"]);

export function resolveHomeImageSrc(src: string | undefined): string | null {
  if (!src) {
    return null;
  }

  if (src.startsWith("/") || src.startsWith("data:")) {
    return src;
  }

  try {
    const parsedUrl = new URL(src);

    if (DIRECT_IMAGE_HOSTS.has(parsedUrl.hostname)) {
      return src;
    }

    return `/api/img-proxy?url=${encodeURIComponent(src)}`;
  } catch {
    return src;
  }
}