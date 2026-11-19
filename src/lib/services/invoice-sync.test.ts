import { describe, expect, it } from "vitest";
import { settingsUpdateSchema } from "../schemas/settings";
import {
  canSendToEf,
  DEMO_CUSTOMER_MESSAGE,
  initialSyncAction,
  syncSkipMessage,
  selectInvoicesToSync,
  SYNC_DISABLED_MESSAGE,
  SYNC_EXCLUDED_MESSAGE,
} from "./invoice-sync";

describe("initialSyncAction", () => {
  it("pushes immediately only when sync AND automatic sync are on", () => {
    expect(initialSyncAction(true, false, true)).toBe("push");
    expect(initialSyncAction(true, false, false)).toBe("skip");
    expect(initialSyncAction(false, false, true)).toBe("skip");
    expect(initialSyncAction(true, true, true)).toBe("skip");
  });

  it("explains why a new invoice was not pushed", () => {
    expect(syncSkipMessage(true, false, false)).toMatch(/Facturen/);
    expect(syncSkipMessage(false, false, false)).toMatch(/staat uit/);
    expect(syncSkipMessage(true, true, true)).toMatch(/Demoklant/);
  });

  it("pushes a new invoice only when sync is on", () => {
    expect(initialSyncAction(true)).toBe("push");
    expect(initialSyncAction(false)).toBe("skip");
  });
});

describe("canSendToEf", () => {
  it("allows failed and not-synced invoices while sync is on", () => {
    expect(canSendToEf({ efInvoiceId: null, pushStatus: "FAILED" }, true)).toEqual({ allowed: true });
    expect(canSendToEf({ efInvoiceId: null, pushStatus: "NOT_SYNCED" }, true)).toEqual({ allowed: true });
  });

  it("refuses everything while sync is off", () => {
    expect(canSendToEf({ efInvoiceId: null, pushStatus: "NOT_SYNCED" }, false)).toEqual({
      allowed: false,
      reason: SYNC_DISABLED_MESSAGE,
      status: 409,
    });
  });

  it("never pushes twice and leaves pending pushes alone", () => {
    expect(canSendToEf({ efInvoiceId: 55, pushStatus: "CONCEPT_CREATED" }, true)).toMatchObject({
      allowed: false,
      status: 409,
    });
    expect(canSendToEf({ efInvoiceId: null, pushStatus: "PENDING" }, true)).toMatchObject({ allowed: false });
  });
});

describe("efInvoiceSyncEnabled setting", () => {
  it("can be switched on its own without touching other settings", () => {
    expect(settingsUpdateSchema.parse({ efInvoiceSyncEnabled: false })).toEqual({ efInvoiceSyncEnabled: false });
    expect(() => settingsUpdateSchema.parse({ efInvoiceSyncEnabled: "nee" })).toThrow();
    // Partial update of only the automatic-sync switch leaves the master switch alone.
    expect(settingsUpdateSchema.parse({ efInvoiceAutoSync: false })).toEqual({ efInvoiceAutoSync: false });
  });
});

describe("demo customers", () => {
  it("are never pushed, also not with sync on", () => {
    expect(initialSyncAction(true, true)).toBe("skip");
    expect(canSendToEf({ efInvoiceId: null, pushStatus: "NOT_SYNCED" }, true, true)).toMatchObject({
      allowed: false,
      reason: DEMO_CUSTOMER_MESSAGE,
    });
  });
});

describe("niet versturen + alle niet-gesyncte versturen", () => {
  it("never sends an invoice switched to 'niet versturen'", () => {
    expect(canSendToEf({ efInvoiceId: null, pushStatus: "NOT_SYNCED", syncExcluded: true }, true)).toMatchObject({
      allowed: false,
      reason: SYNC_EXCLUDED_MESSAGE,
    });
    expect(canSendToEf({ efInvoiceId: null, pushStatus: "NOT_SYNCED", syncExcluded: false }, true)).toEqual({ allowed: true });
  });

  it("selects the sendable invoices, oldest first", () => {
    const base = { efInvoiceId: null, syncExcluded: false, isDemoCustomer: false };
    const list = [
      { ...base, id: 5, pushStatus: "FAILED" as const },
      { ...base, id: 2, pushStatus: "NOT_SYNCED" as const },
      { ...base, id: 3, pushStatus: "NOT_SYNCED" as const, syncExcluded: true },
      { ...base, id: 4, pushStatus: "NOT_SYNCED" as const, isDemoCustomer: true },
      { ...base, id: 6, pushStatus: "CONCEPT_CREATED" as const, efInvoiceId: 77 },
      { ...base, id: 7, pushStatus: "PENDING" as const },
    ];
    expect(selectInvoicesToSync(list, true).map((i) => i.id)).toEqual([2, 5]);
    expect(selectInvoicesToSync(list, false)).toEqual([]);
  });
});
