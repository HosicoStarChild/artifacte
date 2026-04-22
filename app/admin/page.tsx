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
import { hasAdminAccess, isOwnerWallet } from "@/lib/admin"
import type { MintingForm } from "@/lib/admin-dashboard"

import {
  addWhitelistEntryRequest,
  approveListingRequest,
  approveSubmissionRequest,
  deleteWhitelistEntryRequest,
  fetchAdminDashboard,
  rejectListingRequest,
  rejectSubmissionRequest,
  submitMintMetadataRequest,
} from "./_lib/client"
import {
  AdminDashboardView,
  type NewWhitelistEntryInput,
} from "./_components/admin-dashboard-view"
import { MintFormContent } from "./mint/content"

function getErrorMessage(error: Error) {
  return error.message || "Request failed"
}

function AccessCard({
  actionLabel,
  description,
  onAction,
  title,
}: {
  actionLabel?: string
  description: string
  onAction?: () => void
  title: string
}) {
  return (
    <Card className="border-white/10 bg-black/20 backdrop-blur-sm">
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      {actionLabel && onAction ? (
        <CardContent>
          <Button onClick={onAction}>{actionLabel}</Button>
        </CardContent>
      ) : null}
    </Card>
  )
}

export default function AdminPage() {
  const { connected, publicKey, signMessage } = useWallet()
  const queryClient = useQueryClient()
  const walletAddress = publicKey?.toBase58() ?? null
  const canReadAdmin = hasAdminAccess(walletAddress)
  const canAccessMintTab = isOwnerWallet(walletAddress)
  const [pendingListingId, setPendingListingId] = useState<string | null>(null)
  const [pendingSubmissionId, setPendingSubmissionId] = useState<string | null>(null)
  const [pendingWhitelistAddress, setPendingWhitelistAddress] =
    useState<string | null>(null)

  const dashboardQuery = useQuery({
    queryKey: ["admin-dashboard", walletAddress],
    enabled: Boolean(connected && walletAddress && canReadAdmin && signMessage),
    queryFn: async () => {
      if (!walletAddress || !signMessage) {
        throw new Error("Connected wallet with message signing is required")
      }

      return fetchAdminDashboard({ signMessage, walletAddress })
    },
  })

  const listingMutation = useMutation({
    mutationFn: async (input: { action: "approve" | "reject"; id: string }) => {
      if (!walletAddress || !signMessage) {
        throw new Error("Connected wallet with message signing is required")
      }

      return input.action === "approve"
        ? approveListingRequest({
            id: input.id,
            signMessage,
            walletAddress,
          })
        : rejectListingRequest({
            id: input.id,
            signMessage,
            walletAddress,
          })
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ["admin-dashboard", walletAddress],
      })
    },
  })

  const submissionMutation = useMutation({
    mutationFn: async (
      input:
        | { kind: "approve"; id: string }
        | { kind: "reject"; id: string; notes: string }
        | { kind: "mint"; form: MintingForm; id: string }
    ) => {
      if (!walletAddress || !signMessage) {
        throw new Error("Connected wallet with message signing is required")
      }

      if (input.kind === "approve") {
        return approveSubmissionRequest({
          id: input.id,
          signMessage,
          walletAddress,
        })
      }

      if (input.kind === "reject") {
        return rejectSubmissionRequest({
          adminNotes: input.notes,
          id: input.id,
          signMessage,
          walletAddress,
        })
      }

      return submitMintMetadataRequest({
        form: input.form,
        signMessage,
        walletAddress,
      })
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ["admin-dashboard", walletAddress],
      })
    },
  })

  const whitelistMutation = useMutation({
    mutationFn: async (
      input:
        | ({ mode: "add" } & NewWhitelistEntryInput)
        | { address: string; mode: "delete" }
    ) => {
      if (!walletAddress || !signMessage) {
        throw new Error("Connected wallet with message signing is required")
      }

      return input.mode === "add"
        ? addWhitelistEntryRequest({
            address: input.address,
            name: input.name,
            role: input.role,
            signMessage,
            walletAddress,
          })
        : deleteWhitelistEntryRequest({
            address: input.address,
            signMessage,
            walletAddress,
          })
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ["admin-dashboard", walletAddress],
      })
    },
  })

  async function handleApproveListing(id: string) {
    setPendingListingId(id)
    try {
      await listingMutation.mutateAsync({ action: "approve", id })
      showToast.success("Listing approved")
    } catch (error) {
      const nextError =
        error instanceof Error ? error : new Error("Failed to approve listing")
      showToast.error(getErrorMessage(nextError))
      throw nextError
    } finally {
      setPendingListingId(null)
    }
  }

  async function handleRejectListing(id: string) {
    setPendingListingId(id)
    try {
      await listingMutation.mutateAsync({ action: "reject", id })
      showToast.success("Listing rejected")
    } catch (error) {
      const nextError =
        error instanceof Error ? error : new Error("Failed to reject listing")
      showToast.error(getErrorMessage(nextError))
      throw nextError
    } finally {
      setPendingListingId(null)
    }
  }

  async function handleApproveSubmission(id: string) {
    setPendingSubmissionId(id)
    try {
      await submissionMutation.mutateAsync({ id, kind: "approve" })
      showToast.success("Submission approved")
    } catch (error) {
      const nextError =
        error instanceof Error ? error : new Error("Failed to approve submission")
      showToast.error(getErrorMessage(nextError))
      throw nextError
    } finally {
      setPendingSubmissionId(null)
    }
  }

  async function handleRejectSubmission(id: string, notes: string) {
    setPendingSubmissionId(id)
    try {
      await submissionMutation.mutateAsync({ id, kind: "reject", notes })
      showToast.success("Submission rejected")
    } catch (error) {
      const nextError =
        error instanceof Error ? error : new Error("Failed to reject submission")
      showToast.error(getErrorMessage(nextError))
      throw nextError
    } finally {
      setPendingSubmissionId(null)
    }
  }

  async function handleSubmitMint(submissionId: string, form: MintingForm) {
    setPendingSubmissionId(submissionId)
    try {
      await submissionMutation.mutateAsync({
        form,
        id: submissionId,
        kind: "mint",
      })
      showToast.success("Mint metadata saved")
    } catch (error) {
      const nextError =
        error instanceof Error
          ? error
          : new Error("Failed to save mint metadata")
      showToast.error(getErrorMessage(nextError))
      throw nextError
    } finally {
      setPendingSubmissionId(null)
    }
  }

  async function handleAddWhitelistEntry(entry: NewWhitelistEntryInput) {
    setPendingWhitelistAddress(entry.address)
    try {
      await whitelistMutation.mutateAsync({ ...entry, mode: "add" })
      showToast.success("Wallet access added")
    } catch (error) {
      const nextError =
        error instanceof Error ? error : new Error("Failed to add wallet")
      showToast.error(getErrorMessage(nextError))
      throw nextError
    } finally {
      setPendingWhitelistAddress(null)
    }
  }

  async function handleDeleteWhitelistEntry(address: string) {
    setPendingWhitelistAddress(address)
    try {
      await whitelistMutation.mutateAsync({ address, mode: "delete" })
      showToast.success("Wallet removed")
    } catch (error) {
      const nextError =
        error instanceof Error ? error : new Error("Failed to remove wallet")
      showToast.error(getErrorMessage(nextError))
      throw nextError
    } finally {
      setPendingWhitelistAddress(null)
    }
  }

  return (
    <main className="min-h-screen bg-dark-900 bg-[radial-gradient(circle_at_top,rgba(212,175,55,0.12),transparent_35%),linear-gradient(180deg,rgba(10,10,10,0.95),rgba(10,10,10,1))] pt-32 pb-20">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        {!connected ? (
          <AccessCard
            description="Connect an authorized wallet to load the signed admin surface."
            title="Admin access required"
          />
        ) : !walletAddress || !canReadAdmin ? (
          <AccessCard
            description="This wallet is not on the admin access list for Artifacte."
            title="Access denied"
          />
        ) : !signMessage ? (
          <AccessCard
            description="This admin surface now requires wallet message signing for reads and mutations. Switch to a wallet that supports signMessage."
            title="Wallet signing required"
          />
        ) : (
          <AdminDashboardView
            canAccessMintTab={canAccessMintTab}
            dashboard={dashboardQuery.data}
            errorMessage={
              dashboardQuery.error instanceof Error
                ? dashboardQuery.error.message
                : null
            }
            isDashboardLoading={dashboardQuery.isLoading}
            isWhitelistMutationPending={whitelistMutation.isPending}
            mintTabContent={<MintFormContent />}
            onAddWhitelistEntry={handleAddWhitelistEntry}
            onApproveListing={handleApproveListing}
            onApproveSubmission={handleApproveSubmission}
            onDeleteWhitelistEntry={handleDeleteWhitelistEntry}
            onRejectListing={handleRejectListing}
            onRejectSubmission={handleRejectSubmission}
            onSubmitMint={handleSubmitMint}
            pendingListingId={pendingListingId}
            pendingSubmissionId={pendingSubmissionId}
            pendingWhitelistAddress={pendingWhitelistAddress}
          />
        )}
      </div>
    </main>
  )
}