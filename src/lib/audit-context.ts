import { AsyncLocalStorage } from "node:async_hooks";

/**
 * Tracks who is executing the current request, so the audit extension in
 * db.ts (which has no access to the session) knows which userId to put on
 * each AuditLog row.
 *
 * Set by `requireUser()` (src/lib/api.ts) at the start of every protected
 * API endpoint. Background jobs (cron) never set this, so those end up with
 * userId = NULL in the audit trail ("system").
 *
 * Why a mutable holder: `AsyncLocalStorage.enterWith()` only affects the
 * async context it is called in. requireUser() learns the userId *after*
 * `await getSession()`, i.e. inside its own continuation — calling
 * enterWith() there never reached the calling route handler, so every row
 * was logged as "system". Instead, beginAuditScope() runs synchronously at
 * the very start of requireUser() (still in the caller's context, before any
 * await) and installs a holder object; setAuditUser() later fills that same
 * object, which the caller's continuation shares.
 */
interface AuditScope {
  userId: number | null;
}

const storage = new AsyncLocalStorage<AuditScope>();

/**
 * Installs a fresh scope in the *current* async context. Must be called
 * synchronously (before any `await`) by the guard that will later call
 * setAuditUser(), so the scope is visible to the guard's caller.
 */
export function beginAuditScope(): void {
  storage.enterWith({ userId: null });
}

/** Records the acting user in the current scope (creating one if none exists). */
export function setAuditUser(userId: number | null): void {
  const scope = storage.getStore();
  if (scope) {
    scope.userId = userId;
  } else {
    storage.enterWith({ userId });
  }
}

export function getAuditUserId(): number | null {
  return storage.getStore()?.userId ?? null;
}
