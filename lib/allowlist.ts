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

export const ALLOWLIST_QUERY_KEY = ["allowlist"] as const;

export function getAllowlistIdentifier(entry: AllowlistEntry): string | null {
  return entry.collectionAddress || entry.mintAuthority || null;
}

export function matchesAllowlistIdentifier(
  entry: AllowlistEntry,
  identifier: string
): boolean {
  return (
    entry.collectionAddress === identifier || entry.mintAuthority === identifier
  );
}

export function createAllowlistIdentifierMap(
  entries: AllowlistEntry[]
): Record<string, string> {
  const identifiers: Record<string, string> = {};

  for (const entry of entries) {
    if (entry.collectionAddress) {
      identifiers[entry.collectionAddress] = entry.name;
    }

    if (entry.mintAuthority) {
      identifiers[entry.mintAuthority] = entry.name;
    }
  }

  return identifiers;
}

export async function fetchAllowlist(): Promise<AllowlistEntry[]> {
  try {
    const res = await fetch("/api/admin/allowlist");
    if (!res.ok) {
      throw new Error(`Failed to fetch allowlist: ${res.status}`);
    }
    const data = await res.json();
    return Array.isArray(data.collections) ? data.collections : [];
  } catch (error) {
    console.error("Failed to fetch allowlist:", error);
    return [];
  }
}

export async function isCollectionAllowlisted(mintAuthority: string): Promise<boolean> {
  const allowlist = await fetchAllowlist();
  return allowlist.some((entry) => matchesAllowlistIdentifier(entry, mintAuthority));
}

export async function getCollectionInfo(
  mintAuthority: string
): Promise<AllowlistEntry | null> {
  const allowlist = await fetchAllowlist();
  return allowlist.find((entry) => matchesAllowlistIdentifier(entry, mintAuthority)) || null;
}
