import { NextResponse } from "next/server";
import { handleApiError, requireUser } from "@/lib/api";
import { db } from "@/lib/db";

/** GET /api/auth/trusted-devices — overzicht voor Instellingen. */
export async function GET() {
  try {
    const userId = await requireUser();
    const devices = await db.trustedDevice.findMany({
      where: { userId, expiresAt: { gt: new Date() } },
      orderBy: { lastUsedAt: "desc" },
      select: { id: true, label: true, createdAt: true, lastUsedAt: true, expiresAt: true },
    });
    return NextResponse.json(devices);
  } catch (error) {
    return handleApiError(error);
  }
}

/**
 * DELETE /api/auth/trusted-devices — trekt ALLE vertrouwde toestellen in.
 * Bij de eerstvolgende login is overal opnieuw een TOTP-code nodig.
 */
export async function DELETE() {
  try {
    const userId = await requireUser();
    const result = await db.trustedDevice.deleteMany({ where: { userId } });
    return NextResponse.json({ revoked: result.count });
  } catch (error) {
    return handleApiError(error);
  }
}
