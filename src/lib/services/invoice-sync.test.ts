import { describe, expect, it } from "vitest";
import { settingsUpdateSchema } from "../schemas/settings";
import { canSendToEf, initialSyncAction, SYNC_DISABLED_MESSAGE } from "./invoice-sync";

describe("initialSyncAction", () => {
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
  });
});
