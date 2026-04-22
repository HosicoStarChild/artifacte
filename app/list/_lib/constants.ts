import { ARTIFACTE_AUTHORITY, COLLECTORS_CRYPT_COLLECTION, PHYGITALS_COLLECTION } from "@/lib/portfolio";

export const LIST_PAGE_ARTIFACTE_AUTHORITY = ARTIFACTE_AUTHORITY;
export const LIST_PAGE_CC_COLLECTION = COLLECTORS_CRYPT_COLLECTION;
export const LIST_PAGE_PHYG_COLLECTION = PHYGITALS_COLLECTION;

export const LIST_PAGE_SOL_MINT = "So11111111111111111111111111111111111111112";
export const LIST_PAGE_USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";

export const LIST_PAGE_DURATION_OPTIONS = [
  { label: "5 minutes (testing)", value: "0.0833" },
  { label: "30 minutes (testing)", value: "0.5" },
  { label: "24 hours", value: "24" },
  { label: "48 hours", value: "48" },
  { label: "3 days", value: "72" },
  { label: "7 days", value: "168" },
  { label: "14 days", value: "336" },
] as const;

export const LIST_PAGE_ALLOWED_DAS_METHOD = "getAssetsByOwner";