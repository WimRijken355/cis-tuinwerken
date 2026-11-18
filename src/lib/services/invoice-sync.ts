/**
 * Pure rules for syncing invoices to EenvoudigFactureren (no DB/network, so
 * they can be unit tested). The actual push lives in invoices.ts.
 */

export type InvoicePushStatus = "PENDING" | "CONCEPT_CREATED" | "FAILED" | "NOT_SYNCED";

export const DEMO_CUSTOMER_MESSAGE =
  "Demoklant: facturen van demoklanten gaan nooit naar EenvoudigFactureren.";

export const SYNC_EXCLUDED_MESSAGE =
  "Deze factuur staat op \"niet versturen\". Zet dat eerst uit om ze naar EenvoudigFactureren te sturen.";

export const SYNC_DISABLED_MESSAGE =
  "Synchronisatie van facturen naar EenvoudigFactureren staat uit (Instellingen → Algemeen).";

/** What to do with a freshly registered invoice (demo customers are never pushed). */
export function initialSyncAction(syncEnabled: boolean, isDemoCustomer = false): "push" | "skip" {
  return syncEnabled && !isDemoCustomer ? "push" : "skip";
}

/**
 * May this invoice be (re)sent to EF from the invoices page?
 * Only while sync is on, never twice (no duplicate concepts), and only for
 * invoices that failed or were made while sync was off — and never when the
 * invoice was switched to "niet versturen" (syncExcluded).
 */
export function canSendToEf(
  invoice: { efInvoiceId: number | null; pushStatus: InvoicePushStatus; syncExcluded?: boolean },
  syncEnabled: boolean,
  isDemoCustomer = false,
): { allowed: true } | { allowed: false; reason: string; status: number } {
  if (isDemoCustomer) {
    return { allowed: false, reason: DEMO_CUSTOMER_MESSAGE, status: 409 };
  }
  if (invoice.efInvoiceId) {
    return { allowed: false, reason: "Deze factuur staat al in EenvoudigFactureren", status: 409 };
  }
  if (invoice.syncExcluded) {
    return { allowed: false, reason: SYNC_EXCLUDED_MESSAGE, status: 409 };
  }
  if (!syncEnabled) {
    return { allowed: false, reason: SYNC_DISABLED_MESSAGE, status: 409 };
  }
  if (invoice.pushStatus !== "FAILED" && invoice.pushStatus !== "NOT_SYNCED") {
    return { allowed: false, reason: "Deze factuur wordt al verwerkt", status: 409 };
  }
  return { allowed: true };
}

/**
 * Invoices the "alle niet-gesyncte versturen" action sends: those that may be
 * sent (canSendToEf) — so never demo customers, excluded ones, or ones already
 * in EF — oldest first.
 */
export function selectInvoicesToSync<
  T extends {
    id: number;
    efInvoiceId: number | null;
    pushStatus: InvoicePushStatus;
    syncExcluded: boolean;
    isDemoCustomer: boolean;
  },
>(invoices: T[], syncEnabled: boolean): T[] {
  return invoices
    .filter((i) => canSendToEf(i, syncEnabled, i.isDemoCustomer).allowed)
    .sort((a, b) => a.id - b.id);
}
