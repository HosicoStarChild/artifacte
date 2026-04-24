import type {
  AdminMessageSigner,
  SignedAdminRequestInput,
} from "@/lib/admin-request"
import { createSignedAdminHeaders } from "@/lib/admin-request"
import type {
  AdminDashboardData,
  WalletWhitelistEntry,
  MintingForm,
} from "@/lib/admin-dashboard"
import type { Submission } from "@/lib/submissions"

interface SignedAdminClientInput<TBody> {
  body?: TBody
  method: SignedAdminRequestInput["method"]
  path: SignedAdminRequestInput["path"]
  signMessage: AdminMessageSigner
  walletAddress: string
}

interface DashboardResponse {
  ok: true
  dashboard: AdminDashboardData
}

interface ListingMutationResponse {
  listing: {
    id: string
    status: string
  }
  ok: true
}

interface SubmissionMutationResponse {
  ok: true
  submission: Submission
}

interface WalletMutationResponse {
  ok: true
  wallet?: WalletWhitelistEntry
}

export async function signedAdminJsonRequest<TResponse, TBody = undefined>({
  body,
  method,
  path,
  signMessage,
  walletAddress,
}: SignedAdminClientInput<TBody>): Promise<TResponse> {
  const bodyText = body ? JSON.stringify(body) : ""
  const signedHeaders = await createSignedAdminHeaders({
    walletAddress,
    signMessage,
    method,
    path,
    body: bodyText,
  })
  const response = await fetch(path, {
    method,
    headers: {
      ...(bodyText ? { "Content-Type": "application/json" } : {}),
      ...signedHeaders,
    },
    ...(bodyText ? { body: bodyText } : {}),
    cache: "no-store",
  })
  const responseText = await response.text()
  const responseBody = responseText
    ? (JSON.parse(responseText) as TResponse & { error?: string })
    : ({} as TResponse & { error?: string })

  if (!response.ok) {
    throw new Error(responseBody.error ?? "Admin request failed")
  }

  return responseBody
}

export async function fetchAdminDashboard(input: {
  signMessage: AdminMessageSigner
  walletAddress: string
}): Promise<AdminDashboardData> {
  const response = await signedAdminJsonRequest<DashboardResponse>({
    method: "GET",
    path: "/api/admin/dashboard",
    signMessage: input.signMessage,
    walletAddress: input.walletAddress,
  })

  return response.dashboard
}

export async function approveListingRequest(input: {
  id: string
  signMessage: AdminMessageSigner
  walletAddress: string
}) {
  return signedAdminJsonRequest<ListingMutationResponse, { action: "approve"; id: string }>({
    method: "PATCH",
    path: "/api/listings",
    signMessage: input.signMessage,
    walletAddress: input.walletAddress,
    body: {
      action: "approve",
      id: input.id,
    },
  })
}

export async function rejectListingRequest(input: {
  id: string
  signMessage: AdminMessageSigner
  walletAddress: string
}) {
  return signedAdminJsonRequest<ListingMutationResponse, { action: "reject"; id: string }>({
    method: "PATCH",
    path: "/api/listings",
    signMessage: input.signMessage,
    walletAddress: input.walletAddress,
    body: {
      action: "reject",
      id: input.id,
    },
  })
}

export async function approveSubmissionRequest(input: {
  id: string
  signMessage: AdminMessageSigner
  walletAddress: string
}) {
  return signedAdminJsonRequest<SubmissionMutationResponse, { id: string; status: "approved" }>({
    method: "PATCH",
    path: "/api/submissions",
    signMessage: input.signMessage,
    walletAddress: input.walletAddress,
    body: {
      id: input.id,
      status: "approved",
    },
  })
}

export async function rejectSubmissionRequest(input: {
  id: string
  adminNotes: string
  signMessage: AdminMessageSigner
  walletAddress: string
}) {
  return signedAdminJsonRequest<SubmissionMutationResponse, {
    adminNotes: string
    id: string
    status: "rejected"
  }>({
    method: "PATCH",
    path: "/api/submissions",
    signMessage: input.signMessage,
    walletAddress: input.walletAddress,
    body: {
      adminNotes: input.adminNotes,
      id: input.id,
      status: "rejected",
    },
  })
}

export async function submitMintMetadataRequest(input: {
  form: MintingForm
  signMessage: AdminMessageSigner
  walletAddress: string
}) {
  return signedAdminJsonRequest<SubmissionMutationResponse, {
    id: string
    nftImageUri: string
    nftMetadata: {
      attributes: Array<{ trait_type: string; value: string }>
      description: string
      external_url: string
      image: string
      name: string
      seller_fee_basis_points: number
      symbol: string
    }
    nftName: string
    nftSymbol: string
    status: "minted"
  }>({
    method: "PATCH",
    path: "/api/submissions",
    signMessage: input.signMessage,
    walletAddress: input.walletAddress,
    body: {
      id: input.form.submissionId,
      nftImageUri: input.form.nftImageUri,
      nftMetadata: {
        attributes: input.form.attributes
          .filter((attribute) => attribute.key && attribute.value)
          .map((attribute) => ({
            trait_type: attribute.key,
            value: attribute.value,
          })),
        description: "Submission minted on Artifacte",
        external_url: "https://artifacte.io",
        image: input.form.nftImageUri,
        name: input.form.nftName,
        seller_fee_basis_points: 500,
        symbol: input.form.nftSymbol,
      },
      nftName: input.form.nftName,
      nftSymbol: input.form.nftSymbol,
      status: "minted",
    },
  })
}

export async function addWhitelistEntryRequest(input: {
  address: string
  name: string
  role: WalletWhitelistEntry["role"]
  signMessage: AdminMessageSigner
  walletAddress: string
}) {
  return signedAdminJsonRequest<WalletMutationResponse, {
    address: string
    name: string
    role: WalletWhitelistEntry["role"]
  }>({
    method: "POST",
    path: "/api/admin/wallet-whitelist",
    signMessage: input.signMessage,
    walletAddress: input.walletAddress,
    body: {
      address: input.address,
      name: input.name,
      role: input.role,
    },
  })
}

export async function deleteWhitelistEntryRequest(input: {
  address: string
  signMessage: AdminMessageSigner
  walletAddress: string
}) {
  return signedAdminJsonRequest<WalletMutationResponse, { address: string }>({
    method: "DELETE",
    path: "/api/admin/wallet-whitelist",
    signMessage: input.signMessage,
    walletAddress: input.walletAddress,
    body: {
      address: input.address,
    },
  })
}