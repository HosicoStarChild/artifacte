import { revalidatePath, revalidateTag } from "next/cache";
import { NextRequest, NextResponse } from "next/server";

const HOME_SPIRITS_CACHE_TAG = "home-spirits";
const REVALIDATE_SECRET = process.env.CRON_SECRET || process.env.ADMIN_SECRET;

export const maxDuration = 10;

function isAuthorized(request: NextRequest): boolean {
  const authorizationHeader = request.headers.get("authorization");
  return Boolean(REVALIDATE_SECRET) && authorizationHeader === `Bearer ${REVALIDATE_SECRET}`;
}

async function handleRevalidation(request: NextRequest) {
  if (!REVALIDATE_SECRET) {
    return NextResponse.json({ error: "Revalidation secret not configured" }, { status: 503 });
  }

  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    revalidateTag(HOME_SPIRITS_CACHE_TAG, "max");
    revalidatePath("/", "page");

    return NextResponse.json({
      ok: true,
      revalidated: [HOME_SPIRITS_CACHE_TAG, "/"],
    });
  } catch (error) {
    console.error("[revalidate-home-spirits] Failed to refresh homepage spirits cache", error);
    return NextResponse.json({ error: "Failed to revalidate homepage spirits cache" }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  return handleRevalidation(request);
}

export async function POST(request: NextRequest) {
  return handleRevalidation(request);
}