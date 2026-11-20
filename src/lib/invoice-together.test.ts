import { describe, expect, it } from "vitest";
import { customerInvoiceMessage, previewCustomerInvoice } from "./customer-invoice";
import { removeLineKeepingHeading } from "./invoice-content";

describe("Factuur maken (customer page)", () => {
  const cis = { resourceId: 1, name: "Cis", type: "PERSON" as const, hourlyRate: 45, vatRate: 21 };
  const job = (todoId: number, title: string, hours: number) => ({
    todoId,
    title,
    invoiceDescription: null,
    lastRegisteredOn: "2027-05-12T07:00:00Z",
    days: [{ date: "2027-05-12T07:00:00Z", labor: [{ ...cis, invoicedHours: hours }], extras: [] }],
    quoteLines: [],
  });

  it("previews only the ticked todos, grouped", () => {
    const built = previewCustomerInvoice([job(1, "Haag", 2), job(2, "Gras", 1), job(3, "Snoei", 4)], new Set([1, 2]), new Set());
    expect(built.items.filter((i) => i.type === "text").map((i) => i.description)).toEqual(["Haag", "Gras"]);
    expect(built.totalExclVat).toBe(135);
  });

  it("explains what happened with EF", () => {
    expect(customerInvoiceMessage({ invoiceId: 1, efPush: { ok: true } })).toMatch(/als concept/);
    expect(customerInvoiceMessage({ invoiceId: 1, efPush: { ok: false, skipped: true, message: "Sync staat uit." } })).toBe(
      "Factuur gemaakt. Sync staat uit.",
    );
    expect(customerInvoiceMessage({ invoiceId: 1, efPush: { ok: false, error: "500" } })).toMatch(/mislukte \(500\)/);
  });
});

describe("invoice editor: removing a line keeps its todo heading", () => {
  const lines = [{ key: 1, heading: "Haag" }, { key: 2 }, { key: 3, heading: "Gras" }];
  it("moves the heading to the next line of the same todo", () => {
    expect(removeLineKeepingHeading(lines, 1)).toEqual([{ key: 2, heading: "Haag" }, { key: 3, heading: "Gras" }]);
  });
  it("drops it when the todo has no lines left", () => {
    expect(removeLineKeepingHeading([{ key: 1, heading: "Haag" }, { key: 3, heading: "Gras" }], 1)).toEqual([
      { key: 3, heading: "Gras" },
    ]);
  });
});
