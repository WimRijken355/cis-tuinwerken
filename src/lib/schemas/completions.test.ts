import { describe, expect, it } from "vitest";
import { completionInputSchema } from "./completions";

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
