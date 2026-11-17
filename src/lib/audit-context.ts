import { AsyncLocalStorage } from "node:async_hooks";

/**
 * Tracks who is executing the current request, so the audit extension in
 * db.ts (which has no access to the session) knows which userId to put on
 * each AuditLog row.
 *
 * Set by `requireUser()` (src/lib/api.ts) at the start of every protected
 * API endpoint. Background jobs (cron) never set this, so those end up with
 * userId = NULL in the audit trail ("system").
 */
const storage = new AsyncLocalStorage<number | null>();

export function setAuditUser(userId: number | null): void {
  storage.enterWith(userId);
}

export function getAuditUserId(): number | null {
  return storage.getStore() ?? null;
}
