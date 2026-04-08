export interface CollectionLinks {
  website?: string;
  twitter?: string;
  discord?: string;
}

export interface CollectionMarketplaces {
  magicEden?: {
    symbol: string;
  };
  tensor?: {
    slug: string;
  };
  order?: Array<"artifacte" | "magiceden" | "tensor">;
}

export interface AllowlistEntry {
  mintAuthority?: string;
  collectionAddress?: string;
  name: string;
  category?: string;
  matchBy?: string;
  image?: string;
  supply?: number;
  description?: string;
  links?: CollectionLinks;
  marketplaces?: CollectionMarketplaces;
  addedAt?: number;
  addedBy?: string;
  verified?: boolean;
}

export async function fetchAllowlist(): Promise<AllowlistEntry[]> {
  try {
    const res = await fetch("/api/admin/allowlist");
    const data = await res.json();
    return data.collections || [];
  } catch (error) {
    console.error("Failed to fetch allowlist:", error);
    return [];
  }
}

export async function isCollectionAllowlisted(mintAuthority: string): Promise<boolean> {
  const allowlist = await fetchAllowlist();
  return allowlist.some(
    (entry) =>
      entry.mintAuthority === mintAuthority ||
      entry.collectionAddress === mintAuthority
  );
}

export async function getCollectionInfo(
  mintAuthority: string
): Promise<AllowlistEntry | null> {
  const allowlist = await fetchAllowlist();
  return (
    allowlist.find(
      (entry) =>
        entry.mintAuthority === mintAuthority ||
        entry.collectionAddress === mintAuthority
    ) || null
  );
}
