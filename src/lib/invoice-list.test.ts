import { describe, expect, it } from "vitest";
import { EMPTY_INVOICE_FILTER, filterInvoices, isInvoiceFilterActive, matchesInvoiceFilter } from "./invoice-list";

const base = {
  customerName: "Janssens Piet",
  workTitle: "Haag snoeien",
  errorMessage: null as string | null,
  pushStatus: "NOT_SYNCED" as const,
  syncExcluded: false,
  // 23:30 UTC on 2026-11-17 = 2026-11-18 00:30 in Brussels
  workDate: "2026-11-17T23:30:00.000Z",
};

describe("matchesInvoiceFilter", () => {
  it("matches everything with the empty filter", () => {
    expect(matchesInvoiceFilter(base, EMPTY_INVOICE_FILTER)).toBe(true);
    expect(isInvoiceFilterActive(EMPTY_INVOICE_FILTER)).toBe(false);
  });

  it("filters on customer name, work title and error message, case-insensitive", () => {
    expect(matchesInvoiceFilter(base, { ...EMPTY_INVOICE_FILTER, text: "janssens" })).toBe(true);
    expect(matchesInvoiceFilter(base, { ...EMPTY_INVOICE_FILTER, text: "HAAG" })).toBe(true);
    expect(matchesInvoiceFilter({ ...base, errorMessage: "Timeout bij EF" }, { ...EMPTY_INVOICE_FILTER, text: "timeout" })).toBe(true);
    expect(matchesInvoiceFilter(base, { ...EMPTY_INVOICE_FILTER, text: "peeters" })).toBe(false);
  });

  it("filters on push status and on 'niet versturen'", () => {
    expect(matchesInvoiceFilter(base, { ...EMPTY_INVOICE_FILTER, status: "NOT_SYNCED" })).toBe(true);
    expect(matchesInvoiceFilter(base, { ...EMPTY_INVOICE_FILTER, status: "FAILED" })).toBe(false);
    expect(matchesInvoiceFilter(base, { ...EMPTY_INVOICE_FILTER, status: "EXCLUDED" })).toBe(false);
    expect(matchesInvoiceFilter({ ...base, syncExcluded: true }, { ...EMPTY_INVOICE_FILTER, status: "EXCLUDED" })).toBe(true);
  });

  it("filters on the Brussels work day, inclusive", () => {
    expect(matchesInvoiceFilter(base, { ...EMPTY_INVOICE_FILTER, from: "2026-11-18", to: "2026-11-18" })).toBe(true);
    expect(matchesInvoiceFilter(base, { ...EMPTY_INVOICE_FILTER, to: "2026-11-17" })).toBe(false);
    expect(matchesInvoiceFilter(base, { ...EMPTY_INVOICE_FILTER, from: "2026-11-19" })).toBe(false);
  });

  it("filterInvoices keeps the order of the matching invoices", () => {
    const list = [
      { ...base, id: 1 },
      { ...base, id: 2, customerName: "Peeters" },
      { ...base, id: 3 },
    ];
    expect(filterInvoices(list, { ...EMPTY_INVOICE_FILTER, text: "janssens" }).map((i) => i.id)).toEqual([1, 3]);
  });
});
