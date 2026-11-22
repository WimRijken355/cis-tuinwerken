/**
 * Session lifetime rules (pure, no Next.js/iron-session imports so it is testable).
 *
 * The session is rolling: it expires SESSION_TTL_SECONDS after the last use,
 * not after the login. To avoid re-issuing the cookie on every request, the
 * middleware only re-saves it when the last refresh is older than
 * SESSION_REFRESH_INTERVAL_MS.
 */

/** Session expires after 7 days without use. */
export const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7;

/** Re-issue the session cookie at most once per hour. */
export const SESSION_REFRESH_INTERVAL_MS = 60 * 60 * 1000;

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
