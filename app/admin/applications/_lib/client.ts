import type {
  ApplicationMutationResponse,
  ApplicationsResponse,
  ApplicationReviewAction,
} from "@/lib/applications"
import type { AdminMessageSigner } from "@/lib/admin-request"

import { signedAdminJsonRequest } from "../../_lib/client"

export async function fetchAdminApplications(input: {
  signMessage: AdminMessageSigner
  walletAddress: string
}) {
  const response = await signedAdminJsonRequest<ApplicationsResponse>({
    method: "GET",
    path: "/api/applications",
    signMessage: input.signMessage,
    walletAddress: input.walletAddress,
  })

  return response.applications
}

export async function reviewApplicationRequest(input: {
  action: ApplicationReviewAction
  applicationId: string
  rejectionReason?: string
  signMessage: AdminMessageSigner
  walletAddress: string
}) {
  return signedAdminJsonRequest<
    ApplicationMutationResponse,
    {
      action: ApplicationReviewAction
      id: string
      rejectionReason?: string
    }
  >({
    method: "PATCH",
    path: "/api/applications",
    signMessage: input.signMessage,
    walletAddress: input.walletAddress,
    body: {
      action: input.action,
      id: input.applicationId,
      ...(input.rejectionReason
        ? { rejectionReason: input.rejectionReason }
        : {}),
    },
  })
}