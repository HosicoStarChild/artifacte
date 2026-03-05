import { NextRequest, NextResponse } from "next/server";
import { recordSpend } from "@/app/lib/api-keys";

/**
 * POST /api/agents/spend
 * Record a spend and check if it exceeds budget limits
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { walletAddress, amount, currency } = body;

    if (!walletAddress || amount === undefined || !currency) {
      return NextResponse.json(
        { error: "Missing required fields: walletAddress, amount, currency" },
        { status: 400 }
      );
    }

    if (typeof amount !== "number" || amount <= 0) {
      return NextResponse.json(
        { error: "Amount must be a positive number" },
        { status: 400 }
      );
    }

    if (currency !== "SOL" && currency !== "USD1") {
      return NextResponse.json(
        { error: "Currency must be SOL or USD1" },
        { status: 400 }
      );
    }

    const result = recordSpend(walletAddress, amount, currency);

    // Return 403 if over budget
    const statusCode = result.success ? 200 : 403;

    return NextResponse.json(
      {
        success: result.success,
        message: result.message,
        exceeded: result.exceeded,
        remaining: result.remaining,
      },
      { status: statusCode }
    );
  } catch (error) {
    console.error("Failed to record spend:", error);
    return NextResponse.json(
      { error: "Failed to record spend" },
      { status: 500 }
    );
  }
}
