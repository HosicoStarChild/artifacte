import { NextRequest, NextResponse } from "next/server"

import { readAdminDashboardData } from "@/lib/server/admin-dashboard"
import {
  assertSignedAdminRequest,
  toAdminRequestErrorResponse,
} from "@/lib/server/admin-request"

export async function GET(request: NextRequest) {
  try {
    await assertSignedAdminRequest(request, "access")
    const dashboard = await readAdminDashboardData()

    return NextResponse.json({ ok: true, dashboard })
  } catch (error) {
    return toAdminRequestErrorResponse(
      error instanceof Error ? error : new Error("Failed to load admin dashboard"),
      "Failed to load admin dashboard"
    )
  }
}