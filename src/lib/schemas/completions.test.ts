import { describe, expect, it } from "vitest";
import { completionInputSchema, invoicedHoursUpdateSchema } from "./completions";

const line = (resourceId: number, registeredHours: number | string, invoicedHours: number | string) => ({
  resourceId,
  registeredHours,
  invoicedHours,
});

describe("completionInputSchema", () => {
  it("accepts resources with registered and invoiced hours and fills defaults", () => {
    const result = completionInputSchema.parse({ resources: [line(1, 8, 7.5)], invoiceNow: false });
    expect(result.resources).toEqual([{ resourceId: 1, registeredHours: 8, invoicedHours: 7.5 }]);
    expect(result).toMatchObject({ extras: [], taskStates: [], extraTasks: [] });
  });

  it("rounds both hours up per started quarter", () => {
    const result = completionInputSchema.parse({ resources: [line(1, "1,1".replace(",", "."), 2.3)], invoiceNow: true });
    expect(result.resources[0]).toMatchObject({ registeredHours: 1.25, invoicedHours: 2.5 });
  });

  it("allows 0 invoiced hours (registered only) but needs some hours overall", () => {
    expect(completionInputSchema.parse({ resources: [line(1, 3, 0)], invoiceNow: true }).resources[0].invoicedHours).toBe(0);
    expect(() => completionInputSchema.parse({ resources: [line(1, 0, 0)], invoiceNow: true })).toThrow("minstens één");
    expect(() => completionInputSchema.parse({ resources: [], invoiceNow: true })).toThrow();
  });

  it("rejects negative hours, more than 24 h and duplicate resources", () => {
    expect(() => completionInputSchema.parse({ resources: [line(1, -1, 0)], invoiceNow: true })).toThrow();
    expect(() => completionInputSchema.parse({ resources: [line(1, 25, 1)], invoiceNow: true })).toThrow();
    expect(() => completionInputSchema.parse({ resources: [line(1, 1, 1), line(1, 2, 2)], invoiceNow: true })).toThrow();
  });

  it("requires an explicit invoiceNow choice", () => {
    expect(() => completionInputSchema.parse({ resources: [line(1, 1, 1)] })).toThrow();
  });

  it("accepts the checklist result: task states and extra done tasks", () => {
    const result = completionInputSchema.parse({
      resources: [line(1, 1, 1)],
      invoiceNow: false,
      taskStates: [{ id: 5, done: true }],
      extraTasks: [{ checklistItemId: 2, label: "Snoeien" }, { label: "Dakgoot leeggemaakt" }],
    });
    expect(result.extraTasks).toHaveLength(2);
  });
});

describe("invoice remarks and note lines", () => {
  it("accepts a remark per line key and note lines, defaulting to none", () => {
    const base = { resources: [line(1, 1, 1)], invoiceNow: true };
    expect(completionInputSchema.parse(base)).toMatchObject({ lineRemarks: {}, invoiceNotes: [] });
    const parsed = completionInputSchema.parse({
      ...base,
      lineRemarks: { "labor|2026-12-07|45|21": "incl. snoeiwerk" },
      invoiceNotes: [" Bedankt! "],
    });
    expect(parsed.lineRemarks).toEqual({ "labor|2026-12-07|45|21": "incl. snoeiwerk" });
    expect(parsed.invoiceNotes).toEqual(["Bedankt!"]);
  });

  it("limits the length of remarks", () => {
    expect(() =>
      completionInputSchema.parse({ resources: [line(1, 1, 1)], invoiceNow: true, lineRemarks: { k: "x".repeat(501) } }),
    ).toThrow();
  });
});

describe("invoicedHoursUpdateSchema", () => {
  it("rounds up per started quarter and allows 0", () => {
    const r = invoicedHoursUpdateSchema.parse({ entries: [{ laborEntryId: 1, invoicedHours: 1.1 }, { laborEntryId: 2, invoicedHours: 0 }] });
    expect(r.entries.map((e) => e.invoicedHours)).toEqual([1.25, 0]);
  });
  it("refuses empty lists, duplicates and negative hours", () => {
    expect(invoicedHoursUpdateSchema.safeParse({ entries: [] }).success).toBe(false);
    expect(
      invoicedHoursUpdateSchema.safeParse({ entries: [{ laborEntryId: 1, invoicedHours: 1 }, { laborEntryId: 1, invoicedHours: 2 }] })
        .success,
    ).toBe(false);
    expect(invoicedHoursUpdateSchema.safeParse({ entries: [{ laborEntryId: 1, invoicedHours: -1 }] }).success).toBe(false);
  });
});


describe("lineVatRates (VAT per line in the invoice step)", () => {
  const base = { resources: [{ resourceId: 1, registeredHours: 1, invoicedHours: 1 }], invoiceNow: true };
  it("accepts the supported rates and defaults to none", () => {
    expect(completionInputSchema.parse(base).lineVatRates).toEqual({});
    expect(completionInputSchema.parse({ ...base, lineVatRates: { "labor|x": 6 } }).lineVatRates).toEqual({ "labor|x": 6 });
  });
  it("rejects another rate", () => {
    expect(() => completionInputSchema.parse({ ...base, lineVatRates: { "labor|x": 15 } })).toThrow();
  });
});
