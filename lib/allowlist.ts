export interface AllowlistEntry {
  mintAuthority: string;
  name: string;
  category: string;
  addedAt: number;
  addedBy: string;
  verified: boolean;
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
  return allowlist.some((entry) => entry.mintAuthority === mintAuthority);
}

export async function getCollectionInfo(
  mintAuthority: string
): Promise<AllowlistEntry | null> {
  const allowlist = await fetchAllowlist();
  return allowlist.find((entry) => entry.mintAuthority === mintAuthority) || null;
}
