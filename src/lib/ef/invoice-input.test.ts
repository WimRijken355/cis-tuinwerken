import { describe, expect, it } from "vitest";
import { buildEfInvoiceInput } from "./invoice-input";

describe("buildEfInvoiceInput", () => {
  const input = buildEfInvoiceInput({
    clientId: 7,
    date: "2026-11-22",
    daysDue: 30,
    items: [{ type: "item", description: "Werkuren", amount: 45, quantity: 2, tax_rate: 21 }],
  });

  it("uses EF's language name, not an ISO code", () => {
    expect(input.language).toBe("dutch");
  });

  it("creates a draft invoice excluding VAT", () => {
    expect(input).toMatchObject({
      client_id: 7,
      status: "concept",
      date: "2026-11-22",
      days_due: 30,
      currency: "EUR",
      tax_included: "no",
    });
    expect(input.items).toHaveLength(1);
  });
});
