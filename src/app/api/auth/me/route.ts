import { type NextRequest, NextResponse } from "next/server";
import { handleApiError, requireUser } from "@/lib/api";
import { refreshTrustedDevice, trustedDeviceCookieOptions } from "@/lib/auth/trusted-device";
import { db } from "@/lib/db";
import { TRUSTED_DEVICE_COOKIE } from "@/lib/session";

/**
 * Wie ben ik? Gebruikt door de shell om de sessie te controleren.
 * Called on every app load, so it also extends a trusted device (rolling 7 days).
 */
export async function GET(request: NextRequest) {
  try {
    const userId = await requireUser();
    const user = await db.user.findUnique({
      where: { id: userId },
      select: { id: true, username: true, role: true, totpEnabledAt: true },
    });
    const response = NextResponse.json({ user });

    const deviceToken = request.cookies.get(TRUSTED_DEVICE_COOKIE)?.value;
    const expiresAt = await refreshTrustedDevice(userId, deviceToken);
    if (deviceToken && expiresAt) {
      response.cookies.set(TRUSTED_DEVICE_COOKIE, deviceToken, trustedDeviceCookieOptions(expiresAt));
    }
    return response;
  } catch (error) {
    return handleApiError(error);
  }
}
