import { db } from "@/lib/db";
import { shouldRefreshSession, trustedDeviceExpiry } from "./session-ttl";
import { sha256 } from "./totp";

/** Cookie options of the trusted-device cookie, expiring together with the DB row. */
export function trustedDeviceCookieOptions(expiresAt: Date) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    expires: expiresAt,
    path: "/",
  };
}

/**
 * Rolling trusted device: while the user is using the app (logged in), extend
 * the trust of this device to TRUSTED_DEVICE_DAYS from now. Throttled to once
 * per SESSION_REFRESH_INTERVAL_MS via `lastUsedAt`. Only a valid, unexpired
 * device of this same user is extended.
 *
 * @returns the new expiry when the cookie must be re-set, otherwise null.
 */
export async function refreshTrustedDevice(
  userId: number,
  token: string | undefined,
  now: Date = new Date(),
): Promise<Date | null> {
  if (!token) return null;
  const device = await db.trustedDevice.findUnique({ where: { tokenHash: sha256(token) } });
  if (!device || device.userId !== userId || device.expiresAt <= now) return null;
  if (!shouldRefreshSession(device.lastUsedAt.getTime(), now.getTime())) return null;

  const expiresAt = trustedDeviceExpiry(now);
  await db.trustedDevice.update({
    where: { id: device.id },
    data: { lastUsedAt: now, expiresAt },
  });
  return expiresAt;
}
