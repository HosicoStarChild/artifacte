"use client";

import { useState, useEffect } from "react";
import { fetchAllowlist } from "@/lib/allowlist";

interface VerifiedBadgeProps {
  collectionName?: string;
  mintAuthority?: string;
  showLabel?: boolean;
  verifiedBy?: string;
}

export default function VerifiedBadge({
  collectionName,
  mintAuthority,
  showLabel = false,
  verifiedBy,
}: VerifiedBadgeProps) {
  const [isVerified, setIsVerified] = useState(false);
  const [collectionInfo, setCollectionInfo] = useState<string | null>(null);

  useEffect(() => {
    async function checkVerification() {
      const allowlist = await fetchAllowlist();
      
      // Check by mint authority first
      if (mintAuthority) {
        const found = allowlist.find(
          (entry) => entry.mintAuthority === mintAuthority
        );
        if (found) {
          setIsVerified(true);
          setCollectionInfo(found.name);
          return;
        }
      }

      // Check by collection name as fallback
      if (collectionName) {
        const found = allowlist.find(
          (entry) =>
            entry.name.toLowerCase() === collectionName.toLowerCase() ||
            entry.name.toLowerCase().includes(collectionName.toLowerCase())
        );
        if (found) {
          setIsVerified(true);
          setCollectionInfo(found.name);
          return;
        }
      }
    }

    checkVerification();
  }, [collectionName, mintAuthority]);

  if (!isVerified && !verifiedBy) return null;

  return (
    <div className="flex items-center gap-1 text-gold-500">
      <svg
        className="w-4 h-4 flex-shrink-0"
        fill="currentColor"
        viewBox="0 0 20 20"
      >
        <path
          fillRule="evenodd"
          d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
          clipRule="evenodd"
        />
      </svg>
      {(showLabel || verifiedBy) && <span className="text-xs font-semibold">{verifiedBy ? `${verifiedBy} Verified` : "Verified"}</span>}
    </div>
  );
}
