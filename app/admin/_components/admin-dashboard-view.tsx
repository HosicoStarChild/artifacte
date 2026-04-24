"use client"

import Link from "next/link"
import { useState, type ReactNode } from "react"
import {
  ArrowRightIcon,
  CheckIcon,
  Clock3Icon,
  ShieldCheckIcon,
  SparklesIcon,
  Trash2Icon,
  XIcon,
} from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button, buttonVariants } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Separator } from "@/components/ui/separator"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { Skeleton } from "@/components/ui/skeleton"
import { Textarea } from "@/components/ui/textarea"
import {
  createMintingForm,
  formatAdminDate,
  getListingStatusLabel,
  getSubmissionPrimaryImage,
  getSubmissionStatusLabel,
  type AdminDashboardData,
  type AdminListingStatus,
  type AdminPageTab,
  type MintingForm,
  type WalletWhitelistEntry,
} from "@/lib/admin-dashboard"
import {
  ADMIN_CORE_ROYALTY_BASIS_POINTS,
  DEFAULT_NFT_SYMBOL,
  getMetadataFieldStatus,
  METADATA_BYTE_LIMITS,
  sanitizeMetadataSymbol,
} from "@/lib/nft-metadata"
import type { Submission } from "@/lib/submissions"
import { cn } from "@/lib/utils"

import { AdminMediaImage } from "./admin-media-image"

const adminTabs = [
  "overview",
  "listings",
  "submissions",
  "mint",
  "whitelist",
  "settings",
] as const satisfies readonly AdminPageTab[]

function listingBadgeClass(status: AdminListingStatus) {
  return status === "approved"
    ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-200"
    : status === "rejected"
      ? "border-red-500/30 bg-red-500/10 text-red-200"
      : "border-amber-500/30 bg-amber-500/10 text-amber-100"
}

function submissionBadgeClass(status: Submission["status"]) {
  return status === "minted"
    ? "border-sky-500/30 bg-sky-500/10 text-sky-100"
    : status === "approved"
      ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-100"
      : status === "rejected"
        ? "border-red-500/30 bg-red-500/10 text-red-100"
        : "border-amber-500/30 bg-amber-500/10 text-amber-100"
}

function formatSellerWallet(wallet?: string | null) {
  if (!wallet) {
    return "Not provided"
  }

  return `${wallet.slice(0, 4)}...${wallet.slice(-4)}`
}

function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <Card key={index}>
            <CardHeader>
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-8 w-20" />
            </CardHeader>
          </Card>
        ))}
      </div>
      <Card>
        <CardHeader>
          <Skeleton className="h-5 w-48" />
          <Skeleton className="h-4 w-72" />
        </CardHeader>
        <CardContent className="space-y-4">
          {Array.from({ length: 3 }).map((_, index) => (
            <div className="flex items-center gap-4" key={index}>
              <Skeleton className="h-20 w-20 rounded-lg" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-56" />
                <Skeleton className="h-4 w-40" />
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  )
}

function EmptyState({
  description,
  title,
}: {
  description: string
  title: string
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
    </Card>
  )
}

export interface NewWhitelistEntryInput {
  address: string
  name: string
  role: WalletWhitelistEntry["role"]
}

interface AdminDashboardViewProps {
  canAccessMintTab: boolean
  dashboard?: AdminDashboardData
  errorMessage?: string | null
  isDashboardLoading: boolean
  isWhitelistMutationPending: boolean
  mintTabContent?: ReactNode
  pendingListingId?: string | null
  pendingSubmissionId?: string | null
  pendingWhitelistAddress?: string | null
  onAddWhitelistEntry: (entry: NewWhitelistEntryInput) => Promise<void>
  onApproveListing: (id: string) => Promise<void>
  onApproveSubmission: (id: string) => Promise<void>
  onDeleteWhitelistEntry: (address: string) => Promise<void>
  onRejectListing: (id: string) => Promise<void>
  onRejectSubmission: (id: string, notes: string) => Promise<void>
  onSubmitMint: (submissionId: string, form: MintingForm) => Promise<void>
}

export function AdminDashboardView({
  canAccessMintTab,
  dashboard,
  errorMessage,
  isDashboardLoading,
  isWhitelistMutationPending,
  mintTabContent,
  pendingListingId,
  pendingSubmissionId,
  pendingWhitelistAddress,
  onAddWhitelistEntry,
  onApproveListing,
  onApproveSubmission,
  onDeleteWhitelistEntry,
  onRejectListing,
  onRejectSubmission,
  onSubmitMint,
}: AdminDashboardViewProps) {
  const availableTabs = canAccessMintTab
    ? adminTabs
    : adminTabs.filter((tab) => tab !== "mint")
  const [activeTab, setActiveTab] = useState<AdminPageTab>("overview")
  const [rejectTargetId, setRejectTargetId] = useState<string | null>(null)
  const [rejectReason, setRejectReason] = useState("")
  const [rejectError, setRejectError] = useState<string | null>(null)
  const [whitelistError, setWhitelistError] = useState<string | null>(null)
  const [newWhitelistAddress, setNewWhitelistAddress] = useState("")
  const [newWhitelistName, setNewWhitelistName] = useState("")
  const [newWhitelistRole, setNewWhitelistRole] =
    useState<WalletWhitelistEntry["role"]>("seller")
  const [mintSheetOpen, setMintSheetOpen] = useState(false)
  const [mintError, setMintError] = useState<string | null>(null)
  const [mintingSubmission, setMintingSubmission] = useState<Submission | null>(null)
  const [mintForm, setMintForm] = useState<MintingForm>(createMintingForm())

  const mintNameStatus = getMetadataFieldStatus(
    mintForm.nftName,
    METADATA_BYTE_LIMITS.name
  )
  const mintSymbol = sanitizeMetadataSymbol(
    mintForm.nftSymbol || DEFAULT_NFT_SYMBOL
  )
  const mintSymbolStatus = getMetadataFieldStatus(
    mintSymbol,
    METADATA_BYTE_LIMITS.symbol
  )

  const stats = dashboard?.stats
  const listings = dashboard?.listings ?? []
  const submissions = dashboard?.submissions ?? []
  const whitelist = dashboard?.whitelist ?? []

  const approvedSubmissions = submissions.filter(
    (submission) => submission.status === "approved"
  ).length
  const pendingSubmissions = submissions.filter(
    (submission) => submission.status === "pending"
  ).length

  async function handleRejectSubmission() {
    if (!rejectTargetId) {
      return
    }

    try {
      await onRejectSubmission(rejectTargetId, rejectReason.trim())
      setRejectTargetId(null)
      setRejectReason("")
      setRejectError(null)
    } catch (error) {
      setRejectError(error instanceof Error ? error.message : "Failed to reject submission")
    }
  }

  function handleOpenMint(submission: Submission) {
    setMintingSubmission(submission)
    setMintForm(createMintingForm(submission))
    setMintError(null)
    setMintSheetOpen(true)
  }

  async function handleSubmitMint() {
    if (!mintingSubmission) {
      return
    }

    if (!mintNameStatus.value || !mintNameStatus.fits) {
      setMintError(
        `NFT name must fit within ${METADATA_BYTE_LIMITS.name} UTF-8 bytes`
      )
      return
    }

    if (!mintForm.nftImageUri.trim()) {
      setMintError("NFT image URI is required")
      return
    }

    if (!mintSymbolStatus.fits) {
      setMintError(
        `NFT symbol must fit within ${METADATA_BYTE_LIMITS.symbol} UTF-8 bytes`
      )
      return
    }

    try {
      await onSubmitMint(mintingSubmission.id, {
        ...mintForm,
        nftName: mintNameStatus.value,
        nftSymbol: mintSymbol,
        submissionId: mintingSubmission.id,
      })
      setMintSheetOpen(false)
      setMintingSubmission(null)
      setMintError(null)
    } catch (error) {
      setMintError(error instanceof Error ? error.message : "Failed to submit mint metadata")
    }
  }

  async function handleAddWhitelistEntry() {
    const address = newWhitelistAddress.trim()
    const name = newWhitelistName.trim()

    if (!address || !name) {
      setWhitelistError("Wallet address and label are required")
      return
    }

    try {
      await onAddWhitelistEntry({
        address,
        name,
        role: newWhitelistRole,
      })
      setNewWhitelistAddress("")
      setNewWhitelistName("")
      setNewWhitelistRole("seller")
      setWhitelistError(null)
    } catch (error) {
      setWhitelistError(error instanceof Error ? error.message : "Failed to add wallet")
    }
  }

  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <h1 className="font-heading text-4xl font-semibold tracking-tight text-foreground">
          Admin Dashboard
        </h1>
        <p className="max-w-3xl text-sm text-muted-foreground md:text-base">
          Review submissions, approve listings, and manage wallet access through
          a signed admin surface.
        </p>
      </div>

      {errorMessage ? (
        <Card className="border-red-500/30 bg-red-500/5">
          <CardHeader>
            <CardTitle>Dashboard notice</CardTitle>
            <CardDescription className="text-red-100/90">
              {errorMessage}
            </CardDescription>
          </CardHeader>
        </Card>
      ) : null}

      <div className="flex flex-wrap gap-2">
        {availableTabs.map((tab) => (
          <Button
            className="capitalize"
            key={tab}
            onClick={() => setActiveTab(tab)}
            variant={activeTab === tab ? "secondary" : "ghost"}
          >
            {tab}
          </Button>
        ))}
      </div>

      {isDashboardLoading ? <DashboardSkeleton /> : null}

      {!isDashboardLoading && activeTab === "overview" ? (
        <div className="space-y-6">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <Card>
              <CardHeader>
                <CardDescription>Approved listings</CardDescription>
                <CardTitle>{stats?.activeListingsCount ?? 0}</CardTitle>
              </CardHeader>
            </Card>
            <Card>
              <CardHeader>
                <CardDescription>Pending submissions</CardDescription>
                <CardTitle>{pendingSubmissions}</CardTitle>
              </CardHeader>
            </Card>
            <Card>
              <CardHeader>
                <CardDescription>Approved submissions</CardDescription>
                <CardTitle>{approvedSubmissions}</CardTitle>
              </CardHeader>
            </Card>
            <Card>
              <CardHeader>
                <CardDescription>Whitelisted wallets</CardDescription>
                <CardTitle>{whitelist.length}</CardTitle>
              </CardHeader>
            </Card>
          </div>

          <div className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
            <Card>
              <CardHeader>
                <CardTitle>Review queue</CardTitle>
                <CardDescription>
                  The highest-friction admin work is grouped here so you can jump
                  straight to the next decision.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <Button onClick={() => setActiveTab("submissions")} variant="outline">
                  Review pending submissions
                </Button>
                <Button onClick={() => setActiveTab("listings")} variant="outline">
                  Moderate listing approvals
                </Button>
                <Link
                  className={cn(
                    buttonVariants({ size: "default", variant: "ghost" }),
                    "justify-start"
                  )}
                  href="/admin/applications"
                >
                  Creator applications
                  <ArrowRightIcon className="ml-1" />
                </Link>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Security posture</CardTitle>
                <CardDescription>
                  Admin reads and mutations now require wallet-signed requests.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3 text-sm text-muted-foreground">
                <div className="flex items-start gap-2">
                  <ShieldCheckIcon className="mt-0.5 size-4 text-emerald-400" />
                  <p>Signed requests are scoped to method, path, timestamp, and body hash.</p>
                </div>
                <div className="flex items-start gap-2">
                  <Clock3Icon className="mt-0.5 size-4 text-amber-300" />
                  <p>Mutation signatures expire quickly and reject replayed payloads.</p>
                </div>
                <div className="flex items-start gap-2">
                  <SparklesIcon className="mt-0.5 size-4 text-sky-300" />
                  <p>
                    Submission mint metadata keeps the current {ADMIN_CORE_ROYALTY_BASIS_POINTS / 100}%
                    {' '}royalty basis points default.
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      ) : null}

      {!isDashboardLoading && activeTab === "listings" ? (
        <div className="space-y-4">
          {listings.length === 0 ? (
            <EmptyState
              description="Listing submissions will appear here once sellers push them into the review queue."
              title="No listings in review"
            />
          ) : (
            listings.map((listing) => (
              <Card key={listing.id}>
                <CardContent className="flex flex-col gap-4 pt-4 md:flex-row md:items-start">
                  <AdminMediaImage alt={listing.name} size="lg" src={listing.image} />
                  <div className="min-w-0 flex-1 space-y-3">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="space-y-1">
                        <h2 className="font-heading text-lg font-medium text-foreground">
                          {listing.name}
                        </h2>
                        <p className="text-sm text-muted-foreground">
                          {listing.collectionName || "Unknown collection"}
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Badge className={listingBadgeClass(listing.status)} variant="outline">
                          {getListingStatusLabel(listing.status)}
                        </Badge>
                        <Badge variant="secondary">◎ {listing.price}</Badge>
                      </div>
                    </div>

                    <div className="grid gap-2 text-sm text-muted-foreground md:grid-cols-2">
                      <p>Seller: {formatSellerWallet(listing.seller)}</p>
                      <p>Submitted: {formatAdminDate(listing.createdAt)}</p>
                      <p>Mint: {listing.nftMint}</p>
                      <p>Type: {listing.listingType}</p>
                    </div>
                  </div>
                </CardContent>
                {listing.status === "pending" ? (
                  <CardFooter className="flex flex-wrap justify-end gap-2">
                    <Button
                      disabled={pendingListingId === listing.id}
                      onClick={() => onRejectListing(listing.id)}
                      variant="destructive"
                    >
                      <XIcon />
                      Reject
                    </Button>
                    <Button
                      disabled={pendingListingId === listing.id}
                      onClick={() => onApproveListing(listing.id)}
                    >
                      <CheckIcon />
                      Approve
                    </Button>
                  </CardFooter>
                ) : null}
              </Card>
            ))
          )}
        </div>
      ) : null}

      {!isDashboardLoading && activeTab === "submissions" ? (
        <div className="space-y-4">
          {submissions.length === 0 ? (
            <EmptyState
              description="Seller submissions will show up here once they enter review."
              title="No submissions yet"
            />
          ) : (
            submissions.map((submission) => (
              <Card key={submission.id}>
                <CardContent className="space-y-4 pt-4">
                  <div className="flex flex-col gap-4 md:flex-row md:items-start">
                    <AdminMediaImage
                      alt={submission.name}
                      size="lg"
                      src={getSubmissionPrimaryImage(submission)}
                    />
                    <div className="min-w-0 flex-1 space-y-3">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="space-y-1">
                          <h2 className="font-heading text-lg font-medium text-foreground">
                            {submission.name}
                          </h2>
                          <p className="text-sm text-muted-foreground">
                            {submission.category}
                          </p>
                        </div>
                        <Badge
                          className={submissionBadgeClass(submission.status)}
                          variant="outline"
                        >
                          {getSubmissionStatusLabel(submission.status)}
                        </Badge>
                      </div>

                      <p className="text-sm leading-6 text-muted-foreground">
                        {submission.description}
                      </p>

                      <div className="grid gap-2 text-sm text-muted-foreground md:grid-cols-2">
                        <p>Seller: {formatSellerWallet(submission.sellerWallet)}</p>
                        <p>Contact: {submission.contact}</p>
                        <p>Submitted: {formatAdminDate(submission.submittedAt)}</p>
                        <p>ID: {submission.id}</p>
                      </div>

                      {submission.adminNotes ? (
                        <div className="rounded-lg border border-border/70 bg-muted/30 p-3 text-sm text-muted-foreground">
                          <span className="font-medium text-foreground">Admin notes:</span>{" "}
                          {submission.adminNotes}
                        </div>
                      ) : null}
                    </div>
                  </div>

                  {rejectTargetId === submission.id ? (
                    <div className="space-y-3 rounded-lg border border-border/70 bg-muted/20 p-4">
                      <Textarea
                        onChange={(event) => setRejectReason(event.target.value)}
                        placeholder="Add an optional rejection note for the seller"
                        value={rejectReason}
                      />
                      {rejectError ? (
                        <p className="text-sm text-red-300">{rejectError}</p>
                      ) : null}
                      <div className="flex flex-wrap justify-end gap-2">
                        <Button
                          onClick={() => {
                            setRejectTargetId(null)
                            setRejectReason("")
                            setRejectError(null)
                          }}
                          variant="ghost"
                        >
                          Cancel
                        </Button>
                        <Button
                          disabled={pendingSubmissionId === submission.id}
                          onClick={handleRejectSubmission}
                          variant="destructive"
                        >
                          Confirm rejection
                        </Button>
                      </div>
                    </div>
                  ) : null}
                </CardContent>

                <CardFooter className="flex flex-wrap justify-end gap-2">
                  {submission.status === "pending" ? (
                    <>
                      <Button
                        disabled={pendingSubmissionId === submission.id}
                        onClick={() => {
                          setRejectTargetId(submission.id)
                          setRejectError(null)
                        }}
                        variant="destructive"
                      >
                        <XIcon />
                        Reject
                      </Button>
                      <Button
                        disabled={pendingSubmissionId === submission.id}
                        onClick={() => onApproveSubmission(submission.id)}
                      >
                        <CheckIcon />
                        Approve
                      </Button>
                    </>
                  ) : null}

                  {(submission.status === "approved" || submission.status === "minted") ? (
                    <Button
                      disabled={pendingSubmissionId === submission.id}
                      onClick={() => handleOpenMint(submission)}
                      variant="outline"
                    >
                      <SparklesIcon />
                      {submission.status === "minted" ? "Update mint metadata" : "Prepare mint metadata"}
                    </Button>
                  ) : null}
                </CardFooter>
              </Card>
            ))
          )}
        </div>
      ) : null}

      {!isDashboardLoading && activeTab === "whitelist" ? (
        <div className="grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
          <Card>
            <CardHeader>
              <CardTitle>Add wallet access</CardTitle>
              <CardDescription>
                Access changes write directly to the file-backed admin whitelist.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">Wallet address</label>
                <Input
                  onChange={(event) => setNewWhitelistAddress(event.target.value)}
                  placeholder="Solana wallet address"
                  value={newWhitelistAddress}
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">Label</label>
                <Input
                  onChange={(event) => setNewWhitelistName(event.target.value)}
                  placeholder="Internal label"
                  value={newWhitelistName}
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">Role</label>
                <div className="flex gap-2">
                  {(["seller", "admin"] as const).map((role) => (
                    <Button
                      key={role}
                      onClick={() => setNewWhitelistRole(role)}
                      type="button"
                      variant={newWhitelistRole === role ? "secondary" : "ghost"}
                    >
                      {role}
                    </Button>
                  ))}
                </div>
              </div>
              {whitelistError ? (
                <p className="text-sm text-red-300">{whitelistError}</p>
              ) : null}
            </CardContent>
            <CardFooter className="justify-end">
              <Button disabled={isWhitelistMutationPending} onClick={handleAddWhitelistEntry}>
                Add wallet
              </Button>
            </CardFooter>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Current whitelist</CardTitle>
              <CardDescription>
                {whitelist.length} wallet{whitelist.length === 1 ? "" : "s"} can access privileged admin flows.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {whitelist.length === 0 ? (
                <p className="text-sm text-muted-foreground">No wallets are currently whitelisted.</p>
              ) : (
                whitelist.map((entry) => (
                  <div key={entry.address}>
                    <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                      <div className="min-w-0 space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="font-medium text-foreground">{entry.name}</p>
                          <Badge variant="outline">{entry.role}</Badge>
                          {entry.enabled ? (
                            <Badge variant="secondary">Enabled</Badge>
                          ) : (
                            <Badge variant="destructive">Disabled</Badge>
                          )}
                        </div>
                        <p className="truncate text-sm text-muted-foreground">
                          {entry.address}
                        </p>
                      </div>
                      <Button
                        disabled={pendingWhitelistAddress === entry.address}
                        onClick={() => onDeleteWhitelistEntry(entry.address)}
                        size="sm"
                        variant="ghost"
                      >
                        <Trash2Icon />
                        Remove
                      </Button>
                    </div>
                    <Separator className="mt-4" />
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </div>
      ) : null}

      {!isDashboardLoading && activeTab === "settings" ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Admin routing</CardTitle>
              <CardDescription>
                Dashboard data is aggregated through a dedicated signed endpoint.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-muted-foreground">
              <p>
                Listing moderation, submission review, and wallet whitelist
                mutations now rely on message-signed requests instead of spoofable
                body parameters.
              </p>
              <p>
                The applications review page is still available separately while the
                rest of the admin surface is being refactored.
              </p>
            </CardContent>
            <CardFooter>
              <Link
                className={cn(buttonVariants({ variant: "outline", size: "sm" }), "w-full justify-between")}
                href="/admin/applications"
              >
                Open creator applications
                <ArrowRightIcon />
              </Link>
            </CardFooter>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Mint defaults</CardTitle>
              <CardDescription>
                Submission mint metadata stays aligned with the current Core-only mint flow.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-muted-foreground">
              <p>Default symbol: {DEFAULT_NFT_SYMBOL}</p>
              <p>Royalty basis points: {ADMIN_CORE_ROYALTY_BASIS_POINTS}</p>
              <p>Name byte limit: {METADATA_BYTE_LIMITS.name}</p>
              <p>Symbol byte limit: {METADATA_BYTE_LIMITS.symbol}</p>
              <p>URI byte limit: {METADATA_BYTE_LIMITS.uri}</p>
            </CardContent>
          </Card>
        </div>
      ) : null}

      {!isDashboardLoading && activeTab === "mint" ? (
        canAccessMintTab ? (
          mintTabContent ?? (
            <EmptyState
              description="Owner-only mint tools are not available in this build."
              title="Mint tools unavailable"
            />
          )
        ) : (
          <EmptyState
            description="Only the owner wallet can access the embedded mint workflow."
            title="Owner access required"
          />
        )
      ) : null}

      <Sheet onOpenChange={setMintSheetOpen} open={mintSheetOpen}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-xl">
          <SheetHeader>
            <SheetTitle>Submission mint metadata</SheetTitle>
            <SheetDescription>
              Review the generated name, image URI, and trait pairs before the
              submission is marked as minted.
            </SheetDescription>
          </SheetHeader>

          <div className="space-y-4 p-4">
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">NFT name</label>
              <Input
                onChange={(event) =>
                  setMintForm((current) => ({ ...current, nftName: event.target.value }))
                }
                value={mintForm.nftName}
              />
              <p className="text-xs text-muted-foreground">
                {mintNameStatus.bytes}/{METADATA_BYTE_LIMITS.name} bytes
              </p>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">NFT symbol</label>
              <Input
                onChange={(event) =>
                  setMintForm((current) => ({ ...current, nftSymbol: event.target.value }))
                }
                value={mintForm.nftSymbol}
              />
              <p className="text-xs text-muted-foreground">
                {mintSymbolStatus.bytes}/{METADATA_BYTE_LIMITS.symbol} bytes
              </p>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">Image URI</label>
              <Input
                onChange={(event) =>
                  setMintForm((current) => ({
                    ...current,
                    nftImageUri: event.target.value,
                  }))
                }
                placeholder="https://..."
                value={mintForm.nftImageUri}
              />
            </div>

            <div className="space-y-3">
              <div>
                <p className="text-sm font-medium text-foreground">Attributes</p>
                <p className="text-xs text-muted-foreground">
                  Empty rows are ignored when the metadata object is built.
                </p>
              </div>
              {mintForm.attributes.map((attribute, index) => (
                <div className="grid gap-2 md:grid-cols-[1fr_1fr_auto]" key={`${attribute.key}-${index}`}>
                  <Input
                    onChange={(event) =>
                      setMintForm((current) => ({
                        ...current,
                        attributes: current.attributes.map((item, itemIndex) =>
                          itemIndex === index
                            ? { ...item, key: event.target.value }
                            : item
                        ),
                      }))
                    }
                    placeholder="Trait"
                    value={attribute.key}
                  />
                  <Input
                    onChange={(event) =>
                      setMintForm((current) => ({
                        ...current,
                        attributes: current.attributes.map((item, itemIndex) =>
                          itemIndex === index
                            ? { ...item, value: event.target.value }
                            : item
                        ),
                      }))
                    }
                    placeholder="Value"
                    value={attribute.value}
                  />
                  <Button
                    onClick={() =>
                      setMintForm((current) => ({
                        ...current,
                        attributes:
                          current.attributes.length === 1
                            ? [{ key: "", value: "" }]
                            : current.attributes.filter((_, itemIndex) => itemIndex !== index),
                      }))
                    }
                    size="icon-sm"
                    variant="ghost"
                  >
                    <Trash2Icon />
                  </Button>
                </div>
              ))}
              <Button
                onClick={() =>
                  setMintForm((current) => ({
                    ...current,
                    attributes: [...current.attributes, { key: "", value: "" }],
                  }))
                }
                variant="outline"
              >
                Add attribute
              </Button>
            </div>

            {mintError ? <p className="text-sm text-red-300">{mintError}</p> : null}
          </div>

          <SheetFooter>
            <Button onClick={handleSubmitMint}>
              Save mint metadata
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </div>
  )
}