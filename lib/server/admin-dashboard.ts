import fs from "fs/promises"
import path from "path"

import {
  computeAdminDashboardStats,
  toAdminDashboardListing,
  type AdminDashboardData,
  type PendingListingRecord,
  type WalletWhitelistEntry,
} from "@/lib/admin-dashboard"
import type { Submission } from "@/lib/submissions"

const LISTINGS_FILE = path.join(process.cwd(), "data", "pending-listings.json")
const SUBMISSIONS_FILE = path.join(process.cwd(), "data", "submissions.json")
const WHITELIST_FILE = path.join(process.cwd(), "data", "wallet-whitelist.json")

interface ListingsFileData {
  listings: PendingListingRecord[]
}

interface SubmissionsFileData {
  submissions: Submission[]
}

interface WhitelistFileData {
  wallets: WalletWhitelistEntry[]
}

async function readJsonFile<T>(filePath: string, fallback: T): Promise<T> {
  try {
    const content = await fs.readFile(filePath, "utf-8")
    return JSON.parse(content) as T
  } catch {
    return fallback
  }
}

export async function readAdminDashboardData(): Promise<AdminDashboardData> {
  const [listingData, submissionData, whitelistData] = await Promise.all([
    readJsonFile<ListingsFileData>(LISTINGS_FILE, { listings: [] }),
    readJsonFile<SubmissionsFileData>(SUBMISSIONS_FILE, { submissions: [] }),
    readJsonFile<WhitelistFileData>(WHITELIST_FILE, { wallets: [] }),
  ])

  const listings = listingData.listings.map(toAdminDashboardListing)

  return {
    listings,
    stats: computeAdminDashboardStats(listings),
    submissions: submissionData.submissions,
    whitelist: whitelistData.wallets,
  }
}