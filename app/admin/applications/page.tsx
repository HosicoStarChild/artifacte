"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useState } from "react"
import { useWallet } from "@solana/wallet-adapter-react"

import { showToast } from "@/components/ToastContainer"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { hasAdminAccess, isAdminWallet } from "@/lib/admin"
import { ALLOWLIST_QUERY_KEY } from "@/lib/allowlist"
import type { ApplicationReviewAction } from "@/lib/applications"

import { ApplicationsReviewView } from "./_components/applications-review-view"
import { fetchAdminApplications, reviewApplicationRequest } from "./_lib/client"

function getErrorMessage(error: Error) {
  return error.message || "Request failed"
}

function AccessCard({
  description,
  title,
}: {
  description: string
  title: string
}) {
  return (
    <Card className="border-white/10 bg-black/20 backdrop-blur-sm">
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        <Button disabled variant="outline">
          Admin only
        </Button>
      </CardContent>
    </Card>
  )
}

export default function AdminApplicationsPage() {
  const { connected, publicKey, signMessage } = useWallet()
  const queryClient = useQueryClient()
  const walletAddress = publicKey?.toBase58() ?? null
  const canReadAdmin = hasAdminAccess(walletAddress)
  const canReviewApplications = isAdminWallet(walletAddress)
  const [pendingApplicationId, setPendingApplicationId] = useState<string | null>(null)

  const applicationsQuery = useQuery({
    queryKey: ["admin-applications", walletAddress],
    enabled: Boolean(connected && walletAddress && canReadAdmin && signMessage),
    queryFn: async () => {
      if (!walletAddress || !signMessage) {
        throw new Error("Connected wallet with message signing is required")
      }

      return fetchAdminApplications({ signMessage, walletAddress })
    },
  })

  const reviewMutation = useMutation({
    mutationFn: async (input: {
      action: ApplicationReviewAction
      applicationId: string
      rejectionReason?: string
    }) => {
      if (!walletAddress || !signMessage) {
        throw new Error("Connected wallet with message signing is required")
      }

      return reviewApplicationRequest({
        action: input.action,
        applicationId: input.applicationId,
        rejectionReason: input.rejectionReason,
        signMessage,
        walletAddress,
      })
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ["admin-applications", walletAddress],
        }),
        queryClient.invalidateQueries({ queryKey: ALLOWLIST_QUERY_KEY }),
      ])
    },
  })

  async function handleApprove(applicationId: string) {
    setPendingApplicationId(applicationId)
    try {
      await reviewMutation.mutateAsync({
        action: "approve",
        applicationId,
      })
      showToast.success("Application approved")
    } catch (error) {
      const nextError =
        error instanceof Error ? error : new Error("Failed to approve application")
      showToast.error(getErrorMessage(nextError))
      throw nextError
    } finally {
      setPendingApplicationId(null)
    }
  }

  async function handleReject(applicationId: string, rejectionReason: string) {
    if (!rejectionReason.trim()) {
      const nextError = new Error("Please provide a rejection reason")
      showToast.error(nextError.message)
      throw nextError
    }

    setPendingApplicationId(applicationId)
    try {
      await reviewMutation.mutateAsync({
        action: "reject",
        applicationId,
        rejectionReason: rejectionReason.trim(),
      })
      showToast.success("Application rejected")
    } catch (error) {
      const nextError =
        error instanceof Error ? error : new Error("Failed to reject application")
      showToast.error(getErrorMessage(nextError))
      throw nextError
    } finally {
      setPendingApplicationId(null)
    }
  }

  return (
    <main className="min-h-screen bg-dark-900 bg-[radial-gradient(circle_at_top,rgba(212,175,55,0.12),transparent_35%),linear-gradient(180deg,rgba(10,10,10,0.95),rgba(10,10,10,1))] pt-32 pb-20">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        {!connected ? (
          <AccessCard
            description="Connect an authorized wallet to load the signed creator applications queue."
            title="Admin access required"
          />
        ) : !walletAddress || !canReadAdmin ? (
          <AccessCard
            description="This wallet is not on the admin access list for Artifacte."
            title="Access denied"
          />
        ) : !signMessage ? (
          <AccessCard
            description="This admin surface now requires wallet message signing for reads and reviews. Switch to a wallet that supports signMessage."
            title="Wallet signing required"
          />
        ) : (
          <ApplicationsReviewView
            applications={applicationsQuery.data ?? []}
            canReviewApplications={canReviewApplications}
            errorMessage={
              applicationsQuery.error instanceof Error
                ? applicationsQuery.error.message
                : null
            }
            isLoading={applicationsQuery.isLoading}
            onApprove={handleApprove}
            onReject={handleReject}
            pendingApplicationId={pendingApplicationId}
          />
        )}
      </div>
    </main>
  )
}