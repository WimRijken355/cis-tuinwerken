import { NextResponse } from "next/server";
import { handleApiError, requireUser } from "@/lib/api";
import { db } from "@/lib/db";

/** Wie ben ik? Gebruikt door de shell om de sessie te controleren. */
export async function GET() {
  try {
    const userId = await requireUser();
    const user = await db.user.findUnique({
      where: { id: userId },
      select: { id: true, username: true, totpEnabledAt: true },
    });
    return NextResponse.json({ user });
  } catch (error) {
    return handleApiError(error);
  }
}
