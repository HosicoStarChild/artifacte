"use client"

import Link from "next/link"
import { useState } from "react"
import { ArrowLeftIcon, ExternalLinkIcon } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button, buttonVariants } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import { Skeleton } from "@/components/ui/skeleton"
import { Textarea } from "@/components/ui/textarea"
import type { Application, ApplicationStatus } from "@/lib/applications"
import {
  formatApplicationDate,
  getApplicationPrimaryImage,
} from "@/lib/applications"
import { cn } from "@/lib/utils"

import { AdminMediaImage } from "../../_components/admin-media-image"

const applicationTabs: ApplicationStatus[] = ["pending", "approved", "rejected"]

function formatWallet(walletAddress: string) {
  if (walletAddress.length <= 12) {
    return walletAddress
  }

  return `${walletAddress.slice(0, 4)}...${walletAddress.slice(-4)}`
}

function getTwitterUrl(handle: string) {
  return `https://x.com/${handle}`
}

function getStatusClassName(status: ApplicationStatus) {
  switch (status) {
    case "approved":
      return "border-emerald-500/40 bg-emerald-500/10 text-emerald-200"
    case "rejected":
      return "border-red-500/40 bg-red-500/10 text-red-200"
    case "pending":
    default:
      return "border-amber-500/40 bg-amber-500/10 text-amber-200"
  }
}

function EmptyState({
  activeTab,
  canReviewApplications,
}: {
  activeTab: ApplicationStatus
  canReviewApplications: boolean
}) {
  return (
    <Card className="border-white/10 bg-black/20 backdrop-blur-sm">
      <CardContent className="flex flex-col items-center justify-center gap-3 py-12 text-center">
        <CardTitle className="text-xl">No {activeTab} applications</CardTitle>
        <CardDescription className="max-w-xl text-sm text-muted-foreground">
          {activeTab === "pending"
            ? canReviewApplications
              ? "New creator applications will appear here for review."
              : "There are no pending creator applications to inspect right now."
            : `Applications marked ${activeTab} will appear here.`}
        </CardDescription>
      </CardContent>
    </Card>
  )
}

function ApplicationsSkeleton() {
  return (
    <div className="space-y-4">
      {Array.from({ length: 3 }).map((_, index) => (
        <Card key={index} className="border-white/10 bg-black/20 backdrop-blur-sm">
          <CardContent className="space-y-4 p-6">
            <div className="flex items-start gap-4">
              <Skeleton className="h-20 w-20 rounded-lg" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-5 w-40" />
                <Skeleton className="h-4 w-56" />
                <Skeleton className="h-4 w-32" />
              </div>
            </div>
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-10 w-full" />
          </CardContent>
        </Card>
      ))}
    </div>
  )
}

function ApplicationsSummary({ applications }: { applications: Application[] }) {
  const counts = applicationTabs.map((status) => ({
    count: applications.filter((application) => application.status === status).length,
    status,
  }))

  return (
    <div className="grid gap-4 md:grid-cols-3">
      {counts.map(({ count, status }) => (
        <Card key={status} className="border-white/10 bg-black/20 backdrop-blur-sm">
          <CardHeader>
            <CardDescription className="capitalize">{status}</CardDescription>
            <CardTitle className="text-3xl">{count}</CardTitle>
          </CardHeader>
        </Card>
      ))}
    </div>
  )
}

function ApplicationReviewCard({
  application,
  canReviewApplications,
  isPending,
  isReviewing,
  onApprove,
  onBeginReview,
  onCancelReview,
  onChangeReason,
  onReject,
  rejectionReason,
}: {
  application: Application
  canReviewApplications: boolean
  isPending: boolean
  isReviewing: boolean
  onApprove: (applicationId: string) => void
  onBeginReview: (applicationId: string) => void
  onCancelReview: () => void
  onChangeReason: (nextValue: string) => void
  onReject: (applicationId: string) => void
  rejectionReason: string
}) {
  const primaryImage = getApplicationPrimaryImage(application)

  return (
    <Card className="border-white/10 bg-black/20 backdrop-blur-sm">
      <CardContent className="space-y-6 p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex items-start gap-4">
            <AdminMediaImage
              alt={application.collectionName}
              size="md"
              src={primaryImage}
            />
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-xl font-semibold text-foreground">
                  {application.collectionName}
                </h2>
                <Badge className={getStatusClassName(application.status)} variant="outline">
                  {application.status}
                </Badge>
              </div>
              <p className="font-mono text-xs text-muted-foreground">
                {application.collectionAddress}
              </p>
              <div className="flex flex-wrap gap-2 text-sm text-muted-foreground">
                <span>{application.category}</span>
                <span>Submitted {formatApplicationDate(application.submittedAt)}</span>
                <span>Creator {formatWallet(application.walletAddress)}</span>
              </div>
            </div>
          </div>
          <Link
            className={cn(buttonVariants({ size: "sm", variant: "ghost" }), "justify-start")}
            href="/admin"
          >
            <ArrowLeftIcon className="mr-1 size-4" />
            Back to dashboard
          </Link>
        </div>

        <div className="grid gap-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(280px,0.8fr)]">
          <div className="space-y-4">
            <div className="space-y-2">
              <h3 className="text-sm font-semibold uppercase tracking-[0.2em] text-amber-200/90">
                Description
              </h3>
              <p className="text-sm leading-6 text-muted-foreground">{application.description}</p>
            </div>
            <Separator />
            <div className="space-y-2">
              <h3 className="text-sm font-semibold uppercase tracking-[0.2em] text-amber-200/90">
                Creator Pitch
              </h3>
              <p className="text-sm leading-6 text-muted-foreground">{application.pitch}</p>
            </div>
            {application.sampleImages.length > 0 ? (
              <>
                <Separator />
                <div className="space-y-3">
                  <h3 className="text-sm font-semibold uppercase tracking-[0.2em] text-amber-200/90">
                    Sample Images
                  </h3>
                  <div className="grid gap-3 sm:grid-cols-3">
                    {application.sampleImages.map((sampleImage, index) => (
                      <a
                        key={`${application.id}-${sampleImage}`}
                        className="group space-y-2"
                        href={sampleImage}
                        rel="noreferrer"
                        target="_blank"
                      >
                        <AdminMediaImage
                          alt={`${application.collectionName} sample ${index + 1}`}
                          className="w-full"
                          size="lg"
                          src={sampleImage}
                        />
                        <span className="inline-flex items-center text-xs text-muted-foreground transition-colors group-hover:text-foreground">
                          Open image {index + 1}
                          <ExternalLinkIcon className="ml-1 size-3" />
                        </span>
                      </a>
                    ))}
                  </div>
                </div>
              </>
            ) : null}
          </div>

          <div className="space-y-4 rounded-xl border border-white/10 bg-black/30 p-4">
            <div>
              <h3 className="text-sm font-semibold uppercase tracking-[0.2em] text-amber-200/90">
                Creator Details
              </h3>
              <div className="mt-3 space-y-3 text-sm text-muted-foreground">
                <div>
                  <p className="font-medium text-foreground">Wallet</p>
                  <p className="break-all font-mono text-xs">{application.walletAddress}</p>
                </div>
                {application.website ? (
                  <div>
                    <p className="font-medium text-foreground">Website</p>
                    <a
                      className="inline-flex items-center gap-1 text-amber-200 transition-colors hover:text-amber-100"
                      href={application.website}
                      rel="noreferrer"
                      target="_blank"
                    >
                      {application.website}
                      <ExternalLinkIcon className="size-3" />
                    </a>
                  </div>
                ) : null}
                {application.twitter ? (
                  <div>
                    <p className="font-medium text-foreground">Twitter</p>
                    <a
                      className="inline-flex items-center gap-1 text-amber-200 transition-colors hover:text-amber-100"
                      href={getTwitterUrl(application.twitter)}
                      rel="noreferrer"
                      target="_blank"
                    >
                      @{application.twitter}
                      <ExternalLinkIcon className="size-3" />
                    </a>
                  </div>
                ) : null}
              </div>
            </div>
            <Separator />
            {application.status === "pending" ? (
              canReviewApplications ? (
                isReviewing ? (
                  <div className="space-y-3">
                    <div className="space-y-2">
                      <p className="text-sm font-medium text-foreground">
                        Review Notes
                      </p>
                      <Textarea
                        onChange={(event) => onChangeReason(event.target.value)}
                        placeholder="Required when rejecting. Optional context for yourself when approving."
                        rows={4}
                        value={rejectionReason}
                      />
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        disabled={isPending}
                        onClick={() => onApprove(application.id)}
                      >
                        {isPending ? "Saving..." : "Approve"}
                      </Button>
                      <Button
                        disabled={isPending || !rejectionReason.trim()}
                        onClick={() => onReject(application.id)}
                        variant="destructive"
                      >
                        {isPending ? "Saving..." : "Reject"}
                      </Button>
                      <Button
                        disabled={isPending}
                        onClick={onCancelReview}
                        variant="ghost"
                      >
                        Cancel
                      </Button>
                    </div>
                  </div>
                ) : (
                  <Button onClick={() => onBeginReview(application.id)} variant="outline">
                    Review application
                  </Button>
                )
              ) : (
                <p className="text-sm text-muted-foreground">
                  This wallet can inspect creator applications but cannot approve or reject them.
                </p>
              )
            ) : (
              <div className="space-y-2 text-sm text-muted-foreground">
                <p>
                  <span className="font-medium text-foreground">Reviewed by:</span>{" "}
                  {application.reviewedBy ?? "Unknown"}
                </p>
                <p>
                  <span className="font-medium text-foreground">Reviewed on:</span>{" "}
                  {formatApplicationDate(application.reviewedAt)}
                </p>
                {application.rejectionReason ? (
                  <p>
                    <span className="font-medium text-foreground">Reason:</span>{" "}
                    {application.rejectionReason}
                  </p>
                ) : null}
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

export function ApplicationsReviewView({
  applications,
  canReviewApplications,
  errorMessage,
  isLoading,
  pendingApplicationId,
  onApprove,
  onReject,
}: {
  applications: Application[]
  canReviewApplications: boolean
  errorMessage: string | null
  isLoading: boolean
  pendingApplicationId: string | null
  onApprove: (applicationId: string) => Promise<void>
  onReject: (applicationId: string, rejectionReason: string) => Promise<void>
}) {
  const [activeTab, setActiveTab] = useState<ApplicationStatus>("pending")
  const [reviewingId, setReviewingId] = useState<string | null>(null)
  const [rejectionReason, setRejectionReason] = useState("")

  const filteredApplications = applications.filter(
    (application) => application.status === activeTab
  )

  function beginReview(applicationId: string) {
    setReviewingId(applicationId)
    setRejectionReason("")
  }

  function cancelReview() {
    setReviewingId(null)
    setRejectionReason("")
  }

  async function handleApprove(applicationId: string) {
    await onApprove(applicationId)
    cancelReview()
  }

  async function handleReject(applicationId: string) {
    await onReject(applicationId, rejectionReason.trim())
    cancelReview()
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="space-y-3">
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-amber-200/80">
            Admin surface
          </p>
          <div className="space-y-2">
            <h1 className="text-4xl font-semibold tracking-tight text-foreground">
              Creator Applications
            </h1>
            <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
              Review collection applications, verify creator details, and promote approved collections into the marketplace allowlist.
            </p>
          </div>
        </div>
        <Link
          className={cn(buttonVariants({ variant: "ghost" }), "justify-start self-start")}
          href="/admin"
        >
          <ArrowLeftIcon className="mr-1 size-4" />
          Return to admin
        </Link>
      </div>

      <ApplicationsSummary applications={applications} />

      <div className="flex flex-wrap gap-2">
        {applicationTabs.map((tab) => {
          const count = applications.filter((application) => application.status === tab).length

          return (
            <Button
              aria-pressed={activeTab === tab}
              className={cn(
                activeTab === tab ? "border-amber-300/40 bg-amber-500/10 text-amber-100" : undefined
              )}
              key={tab}
              onClick={() => setActiveTab(tab)}
              variant="outline"
            >
              <span className="capitalize">{tab}</span>
              <Badge className="ml-1" variant="secondary">
                {count}
              </Badge>
            </Button>
          )
        })}
      </div>

      {errorMessage ? (
        <Card className="border-red-500/40 bg-red-500/10">
          <CardHeader>
            <CardTitle className="text-red-100">Unable to load applications</CardTitle>
            <CardDescription className="text-red-100/80">{errorMessage}</CardDescription>
          </CardHeader>
        </Card>
      ) : null}

      {isLoading ? (
        <ApplicationsSkeleton />
      ) : filteredApplications.length === 0 ? (
        <EmptyState activeTab={activeTab} canReviewApplications={canReviewApplications} />
      ) : (
        <div className="space-y-5">
          {filteredApplications.map((application) => (
            <ApplicationReviewCard
              application={application}
              canReviewApplications={canReviewApplications}
              isPending={pendingApplicationId === application.id}
              isReviewing={reviewingId === application.id}
              key={application.id}
              onApprove={(applicationId) => {
                void handleApprove(applicationId)
              }}
              onBeginReview={beginReview}
              onCancelReview={cancelReview}
              onChangeReason={setRejectionReason}
              onReject={(applicationId) => {
                void handleReject(applicationId)
              }}
              rejectionReason={reviewingId === application.id ? rejectionReason : ""}
            />
          ))}
        </div>
      )}
    </div>
  )
}