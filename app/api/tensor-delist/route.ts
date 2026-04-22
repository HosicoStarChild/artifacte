import { NextResponse } from "next/server";

import { buildTensorDelistTransaction } from "@/lib/server/tensor-delist";

interface TensorDelistRequestBody {
  mint?: string;
  owner?: string;
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as TensorDelistRequestBody;
    if (!body.mint || !body.owner) {
      return NextResponse.json(
        { error: "Missing mint or owner" },
        { status: 400 },
      );
    }

    const payload = await buildTensorDelistTransaction({
      mint: body.mint,
      owner: body.owner,
    });

    return NextResponse.json(payload);
  } catch (error) {
    const message = error instanceof Error
      ? error.message
      : "Failed to build delist tx";

    console.error("[tensor-delist] Error:", error);

    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export const maxDuration = 60;
