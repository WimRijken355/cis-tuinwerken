/**
 * Pure rules for syncing invoices to EenvoudigFactureren (no DB/network, so
 * they can be unit tested). The actual push lives in invoices.ts.
 */

export type InvoicePushStatus = "PENDING" | "CONCEPT_CREATED" | "FAILED" | "NOT_SYNCED";

export const SYNC_DISABLED_MESSAGE =
  "Synchronisatie van facturen naar EenvoudigFactureren staat uit (Instellingen → Algemeen).";

/** What to do with a freshly registered invoice. */
export function initialSyncAction(syncEnabled: boolean): "push" | "skip" {
  return syncEnabled ? "push" : "skip";
}

/**
 * May this invoice be (re)sent to EF from the invoices page?
 * Only while sync is on, never twice (no duplicate concepts), and only for
 * invoices that failed or were made while sync was off.
 */
export function canSendToEf(
  invoice: { efInvoiceId: number | null; pushStatus: InvoicePushStatus },
  syncEnabled: boolean,
): { allowed: true } | { allowed: false; reason: string; status: number } {
  if (invoice.efInvoiceId) {
    return { allowed: false, reason: "Deze factuur staat al in EenvoudigFactureren", status: 409 };
  }
  if (!syncEnabled) {
    return { allowed: false, reason: SYNC_DISABLED_MESSAGE, status: 409 };
  }
  if (invoice.pushStatus !== "FAILED" && invoice.pushStatus !== "NOT_SYNCED") {
    return { allowed: false, reason: "Deze factuur wordt al verwerkt", status: 409 };
  }
  return { allowed: true };
}
