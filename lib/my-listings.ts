export const MY_LISTING_TABS = ["active", "completed", "cancelled"] as const;

export type MyListingStatus = (typeof MY_LISTING_TABS)[number];

export type MyListingCurrency = "SOL" | "USDC" | "USD1";

export type MyListingSource = "artifacte" | "artifacte-core" | "tensor";

export type MyListingMode = "fixed-price" | "auction";

export interface MyListingRecord {
  id: string;
  name: string;
  image: string;
  href: string;
  nftMint: string;
  price: number;
  currency: MyListingCurrency;
  status: MyListingStatus;
  source: MyListingSource;
  mode: MyListingMode;
  listingTypeLabel: string;
  collectionAddress?: string;
  currentBid?: number;
  endsAt?: number;
  highestBidder?: string;
  royaltyBasisPoints: number;
  isPnft: boolean;
  isCore: boolean;
  isToken2022: boolean;
}

export interface MyListingsPageData {
  ok: true;
  wallet: string;
  listings: MyListingRecord[];
  updatedAt: number;
}

export interface MyListingsApiError {
  ok: false;
  error: string;
}

export type MyListingsApiResponse = MyListingsPageData | MyListingsApiError;

export function isMyListingsPageData(
  payload: MyListingsApiResponse,
): payload is MyListingsPageData {
  return payload.ok;
}