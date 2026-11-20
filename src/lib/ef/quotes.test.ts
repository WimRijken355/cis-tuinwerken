import { describe, expect, it } from "vitest";
import { invalidQuoteLineIds, mapEfQuote, planQuoteCleanup, type EfQuote } from "./quotes";

/** Shaped like the live GET /quotes payload (money as strings). */
const efQuote: EfQuote = {
  quote_id: 501,
  client_id: 77,
  number: "OFF-2026-012",
  reference: " Voortuin ",
  date: "2026-10-03",
  status: "accepted",
  total_without_tax: "1250.50",
  items: [
    { item_id: 1, type: "item", description: "Gazon aanleggen", amount: "12.50", quantity: 80, unit: "m²", tax_rate: 6 },
    { item_id: 2, type: "text", description: "Inclusief afvoer" },
    { item_id: 3, type: "item", description: "Sproeiers", amount: "40.00", quantity: 5, unit: "sproeierkop-xl", discount_percentage: 10, total_without_tax: "180.00", tax_rate: 21 },
    { item_id: 4, type: "item", description: "Gratis", amount: "0.00", quantity: 0, unit: "stuk", tax_rate: 21 },
    { item_id: 5, type: "item", description: "Vreemd tarief", amount: "10.00", quantity: 1, unit: "stuk", tax_rate: 9 },
    { item_id: 6, type: "item", description: "", amount: "5", quantity: "2", unit: "", tax_rate: "21" },
  ],
};

describe("mapEfQuote", () => {
  const mapped = mapEfQuote(efQuote);

  it("maps the quote header (strings → numbers, date as calendar day)", () => {
    expect(mapped).toMatchObject({
      efQuoteId: 501,
      efClientId: 77,
      number: "OFF-2026-012",
      reference: "Voortuin",
      status: "accepted",
      totalExclVat: 1250.5,
    });
    expect(mapped.date.toISOString()).toBe("2026-10-03T00:00:00.000Z");
  });

  it("keeps only invoiceable priced lines: no text, no 0 quantity, no unsupported VAT", () => {
    expect(mapped.lines.map((l) => l.efItemId)).toEqual([1, 3, 6]);
  });

  it("nets the line discount, cuts the unit to 10 chars and fills empty fields", () => {
    expect(mapped.lines[0]).toMatchObject({ description: "Gazon aanleggen", quantity: 80, unit: "m²", amount: 12.5, taxRate: 6 });
    expect(mapped.lines[1]).toMatchObject({ amount: 36, unit: "sproeierko", taxRate: 21 });
    expect(mapped.lines[2]).toMatchObject({ description: "Offertelijn", unit: "stuk", quantity: 2, amount: 5 });
  });
});

describe("planQuoteCleanup", () => {
  it("removes lines and quotes gone from EF, but never a line linked to a todo", () => {
    const plan = planQuoteCleanup({
      local: [
        { efQuoteId: 1, lines: [{ efItemId: 10, linked: false }, { efItemId: 11, linked: false }] },
        { efQuoteId: 2, lines: [{ efItemId: 20, linked: false }] },
        { efQuoteId: 3, lines: [{ efItemId: 30, linked: true }, { efItemId: 31, linked: false }] },
      ],
      remote: [{ efQuoteId: 1, lines: [{ efItemId: 10 }] }],
    });
    expect(plan.deleteLineItemIds.sort()).toEqual([11, 20, 31]);
    // Quote 2 is gone entirely; quote 3 is gone but keeps its linked line.
    expect(plan.deleteQuoteIds).toEqual([2]);
  });
});

describe("invalidQuoteLineIds", () => {
  it("only lines of the customer's linkable quotes, or lines already linked to the todo", () => {
    expect(invalidQuoteLineIds([1, 2, 9], new Set([1, 2]))).toEqual([9]);
    expect(invalidQuoteLineIds([1, 9], new Set([1]), new Set([9]))).toEqual([]);
    expect(invalidQuoteLineIds([], new Set())).toEqual([]);
  });
});
