import type {
  Submission,
  SubmissionMetadataObject,
  SubmissionStatus,
} from "@/lib/submissions"

export type AdminPageTab =
  | "overview"
  | "listings"
  | "submissions"
  | "mint"
  | "whitelist"
  | "settings"

export type AdminListingStatus = "pending" | "approved" | "rejected"

export interface PendingListingRecord {
  id: string
  nftMint: string
  nftName: string
  nftImage: string
  collectionName: string
  collectionAddress: string
  seller: string
  price: number
  currency: "SOL"
  listingType: "fixed" | "auction"
  auctionDuration?: number
  description: string
  status: AdminListingStatus
  submittedAt: number
  reviewedAt?: number
}

export interface AdminDashboardListing {
  id: string
  image: string
  name: string
  price: number
  seller: string
  status: AdminListingStatus
  createdAt: number
  collectionName: string
  nftMint: string
  listingType: PendingListingRecord["listingType"]
}

export interface WalletWhitelistEntry {
  address: string
  name: string
  role: "admin" | "seller"
  addedAt: number
  enabled: boolean
}

export interface AdminDashboardStats {
  activeListingsCount: number
  completedListings: number
  pendingListingsCount: number
  rejectedListingsCount: number
  totalFees: number
  totalSales: number
  totalVolume: number
}

export interface AdminDashboardData {
  listings: AdminDashboardListing[]
  stats: AdminDashboardStats
  submissions: Submission[]
  whitelist: WalletWhitelistEntry[]
}

export interface MintAttributeField {
  key: string
  value: string
}

export interface MintingForm {
  submissionId: string
  nftName: string
  nftSymbol: string
  nftImageUri: string
  attributes: MintAttributeField[]
}

const metadataReservedKeys = new Set([
  "attributes",
  "description",
  "external_url",
  "image",
  "name",
  "properties",
  "seller_fee_basis_points",
  "symbol",
])

export function toAdminDashboardListing(
  listing: PendingListingRecord
): AdminDashboardListing {
  return {
    id: listing.id,
    image: listing.nftImage,
    name: listing.nftName || "Unknown NFT",
    price: listing.price,
    seller: listing.seller,
    status: listing.status,
    createdAt: listing.submittedAt,
    collectionName: listing.collectionName,
    nftMint: listing.nftMint,
    listingType: listing.listingType,
  }
}

export function computeAdminDashboardStats(
  listings: readonly AdminDashboardListing[]
): AdminDashboardStats {
  const pendingListingsCount = listings.filter(
    (listing) => listing.status === "pending"
  ).length
  const activeListingsCount = listings.filter(
    (listing) => listing.status === "approved"
  ).length
  const rejectedListingsCount = listings.filter(
    (listing) => listing.status === "rejected"
  ).length

  return {
    activeListingsCount,
    completedListings: 0,
    pendingListingsCount,
    rejectedListingsCount,
    totalFees: 0,
    totalSales: 0,
    totalVolume: 0,
  }
}

function isMetadataRecord(
  value: SubmissionMetadataObject[string] | SubmissionMetadataObject | null | undefined
): value is SubmissionMetadataObject {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value)
}

export function extractMintAttributes(
  metadata?: SubmissionMetadataObject
): MintAttributeField[] {
  if (!metadata) {
    return [{ key: "", value: "" }]
  }

  if (Array.isArray(metadata.attributes)) {
    const attributes = metadata.attributes
      .flatMap((attribute) => {
        if (!isMetadataRecord(attribute)) {
          return []
        }

        const key = String(attribute.trait_type ?? "").trim()
        const value = String(attribute.value ?? "").trim()

        return key && value ? [{ key, value }] : []
      })

    return attributes.length > 0 ? attributes : [{ key: "", value: "" }]
  }

  const attributes = Object.entries(metadata)
    .filter(([key]) => !metadataReservedKeys.has(key))
    .map(([key, value]) => ({ key, value: String(value ?? "").trim() }))
    .filter((attribute) => attribute.key && attribute.value)

  return attributes.length > 0 ? attributes : [{ key: "", value: "" }]
}

export function createMintingForm(submission?: Submission): MintingForm {
  return {
    submissionId: submission?.id ?? "",
    nftName: submission?.nftName ?? submission?.name ?? "",
    nftSymbol: submission?.nftSymbol ?? "Artifacte",
    nftImageUri: submission?.nftImageUri ?? submission?.photos[0] ?? "",
    attributes: extractMintAttributes(submission?.nftMetadata),
  }
}

export function formatAdminDate(value?: number): string {
  if (!value) {
    return "Not available"
  }

  return new Date(value).toLocaleDateString()
}

export function getListingStatusLabel(status: AdminListingStatus): string {
  return status.charAt(0).toUpperCase() + status.slice(1)
}

export function getSubmissionStatusLabel(status: SubmissionStatus): string {
  return status.charAt(0).toUpperCase() + status.slice(1)
}

export function getSubmissionPrimaryImage(submission: Submission): string | undefined {
  return submission.nftImageUri || submission.photos[0]
}