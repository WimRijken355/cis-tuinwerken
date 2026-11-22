/**
 * Session + trusted-device lifetime rules (pure, no Next.js/iron-session imports so it is testable).
 *
 * The session is rolling: it expires SESSION_TTL_SECONDS after the last use,
 * not after the login. To avoid re-issuing the cookie on every request, the
 * middleware only re-saves it when the last refresh is older than
 * SESSION_REFRESH_INTERVAL_MS. The trusted device (2FA skip) rolls the same
 * way: it is extended on use via /api/auth/me (see trusted-device.ts) with the
 * same throttle, applied to its `lastUsedAt`.
 *
 * Hard limit on top of the rolling rules: MAX_AUTH_AGE_DAYS (± 6 months) after
 * the last 2FA code, both the session and the trusted device stop working, so
 * the user has to log in again with username/e-mail, password AND 2FA.
 */

/** Session expires after 7 days without use. */
export const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7;

/** Re-issue the session cookie at most once per hour. */
export const SESSION_REFRESH_INTERVAL_MS = 60 * 60 * 1000;

/** A trusted device skips the 2FA step until it has been unused for 7 days. */
export const TRUSTED_DEVICE_DAYS = 7;

const DAY_MS = 24 * 60 * 60 * 1000;

/** Full login (incl. 2FA) required at least every ± 6 months. */
export const MAX_AUTH_AGE_DAYS = 183;

/**
 * Whether the last 2FA verification (epoch ms) is older than MAX_AUTH_AGE_DAYS.
 * Unknown (sessions from before this rule) → false; the middleware then starts
 * counting from now.
 */
export function isAuthTooOld(twoFactorAt: number | undefined, now: number): boolean {
  if (twoFactorAt === undefined || !Number.isFinite(twoFactorAt)) return false;
  return now - twoFactorAt >= MAX_AUTH_AGE_DAYS * DAY_MS;
}

/**
 * New expiry of a trusted device that is (re)used at `now` (rolling), but
 * never later than MAX_AUTH_AGE_DAYS after it was trusted (= its 2FA moment).
 */
export function trustedDeviceExpiry(now: Date, trustedAt: Date = now): Date {
  const rolling = now.getTime() + TRUSTED_DEVICE_DAYS * DAY_MS;
  const hardLimit = trustedAt.getTime() + MAX_AUTH_AGE_DAYS * DAY_MS;
  return new Date(Math.min(rolling, hardLimit));
}

/**
 * Whether a logged-in session should be re-saved (which restarts its TTL).
 * Sessions without a `refreshedAt` (e.g. issued before this rule existed)
 * are refreshed immediately.
 */
export function shouldRefreshSession(refreshedAt: number | undefined, now: number): boolean {
  if (refreshedAt === undefined || !Number.isFinite(refreshedAt)) return true;
  // Clock went backwards (or a tampered value): refresh to be safe.
  if (refreshedAt > now) return true;
  return now - refreshedAt >= SESSION_REFRESH_INTERVAL_MS;
}
