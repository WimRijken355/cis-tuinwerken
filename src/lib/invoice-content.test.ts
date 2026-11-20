import { describe, expect, it } from "vitest";
import {
  canEditInvoice,
  contentFromBuilt,
  contentFromItems,
  invoiceContentSchema,
  isVatRate,
  itemsFromContent,
  VAT_RATES,
  rebuildContentKeepingNotes,
  totalOfContent,
  type InvoiceContent,
  vatSummary,
} from "./invoice-content";

const werkuren = { description: "Werkuren op 07/12/2026", quantity: 15.5, unit: "uur", amount: 45, tax_rate: 21 };
const mini = { description: "Minigraver op 07/12/2026", quantity: 6, unit: "uur", amount: 55, tax_rate: 21 };

describe("itemsFromContent / totalOfContent", () => {
  const content: InvoiceContent = {
    lines: [{ item: werkuren }, { item: mini, remark: "incl. transport" }],
    notes: ["Bedankt!", "  "],
  };

  it("puts a remark right below its line and notes at the bottom", () => {
    expect(itemsFromContent(content)).toEqual([
      { type: "item", ...werkuren },
      { type: "item", ...mini },
      { type: "text", description: "incl. transport" },
      { type: "text", description: "Bedankt!" },
    ]);
  });

  it("computes the total in cents", () => {
    expect(totalOfContent(content)).toBe(15.5 * 45 + 6 * 55);
    expect(totalOfContent({ lines: [{ item: { ...mini, quantity: 3, amount: 35.1 } }], notes: [] })).toBe(105.3);
  });
});

describe("contentFromItems (invoices from before contentJson)", () => {
  it("reads a text line right after an item as its remark, others as notes", () => {
    const content = contentFromItems([
      { type: "item", ...werkuren },
      { type: "item", ...mini },
      { type: "text", description: "incl. transport" },
      { type: "text", description: "Bedankt!" },
    ]);
    expect(content.lines[1].remark).toBe("incl. transport");
    expect(content.notes).toEqual(["Bedankt!"]);
  });

  it("round-trips to the same EF lines", () => {
    const items = [
      { type: "item" as const, ...werkuren },
      { type: "text" as const, description: "op zaterdag" },
      { type: "item" as const, ...mini },
    ];
    expect(itemsFromContent(contentFromItems(items))).toEqual(items);
  });
});

describe("canEditInvoice", () => {
  it("only while the invoice is not in EenvoudigFactureren", () => {
    expect(canEditInvoice({ efInvoiceId: null, pushStatus: "NOT_SYNCED" })).toBe(true);
    expect(canEditInvoice({ efInvoiceId: null, pushStatus: "FAILED" })).toBe(true);
    expect(canEditInvoice({ efInvoiceId: 12, pushStatus: "CONCEPT_CREATED" })).toBe(false);
    expect(canEditInvoice({ efInvoiceId: null, pushStatus: "PENDING" })).toBe(false); // push in progress
  });
});

describe("invoiceContentSchema", () => {
  it("rounds quantity and price, drops empty remarks and notes", () => {
    const parsed = invoiceContentSchema.parse({
      lines: [{ item: { ...werkuren, quantity: "2.345", amount: "45.678" }, remark: " " }],
      notes: ["", "Bedankt"],
    });
    expect(parsed.lines[0]).toEqual({ item: { ...werkuren, quantity: 2.35, amount: 45.68 }, remark: undefined });
    expect(parsed.notes).toEqual(["Bedankt"]);
  });

  it("rejects an empty invoice, 0 quantity, negative price, long units and odd VAT", () => {
    expect(() => invoiceContentSchema.parse({ lines: [] })).toThrow();
    expect(() => invoiceContentSchema.parse({ lines: [{ item: { ...werkuren, quantity: 0 } }] })).toThrow();
    expect(() => invoiceContentSchema.parse({ lines: [{ item: { ...werkuren, amount: -1 } }] })).toThrow();
    expect(() => invoiceContentSchema.parse({ lines: [{ item: { ...werkuren, unit: "kubieke meter" } }] })).toThrow();
    expect(() => invoiceContentSchema.parse({ lines: [{ item: { ...werkuren, tax_rate: 15 } }] })).toThrow();
  });

  it("accepts every rate from the editor's VAT dropdown and carries it to EF and the VAT totals", () => {
    expect(VAT_RATES).toEqual([0, 6, 12, 21]);
    for (const rate of VAT_RATES) {
      const parsed = invoiceContentSchema.parse({ lines: [{ item: { ...werkuren, tax_rate: String(rate) } }] });
      expect(parsed.lines[0].item.tax_rate).toBe(rate);
      expect(itemsFromContent(parsed)[0].tax_rate).toBe(rate);
    }
    // Changing a line from 21% to 6% moves it to the 6% VAT bucket.
    const changed = invoiceContentSchema.parse({ lines: [{ item: { ...werkuren, tax_rate: 6 } }] });
    expect(vatSummary(itemsFromContent(changed)).perRate.map((r) => r.rate)).toEqual([6]);
    expect(isVatRate(9)).toBe(false);
  });
});

describe("contentFromBuilt", () => {
  it("keeps the remark with its line, so EF gets the same lines back", () => {
    const content = contentFromBuilt({
      lines: [{ item: { type: "item", ...mini }, remark: "incl. transport" }, { item: { type: "item", ...werkuren } }],
      notes: ["Bedankt!"],
    });
    expect(content).toEqual({
      lines: [{ item: mini, remark: "incl. transport" }, { item: werkuren }],
      notes: ["Bedankt!"],
    });
  });
});

describe("vatSummary (totaal incl. btw)", () => {
  it("computes VAT per rate on the total of that rate, ignoring text lines", () => {
    const summary = vatSummary([
      { type: "item", quantity: 15.5, amount: 45, tax_rate: 21 },
      { type: "text" },
      { type: "item", quantity: 6, amount: 55, tax_rate: 21 },
      { type: "item", quantity: 10, amount: 12.35, tax_rate: 6 },
    ]);
    expect(summary.perRate).toEqual([
      { rate: 21, base: 1027.5, vat: 215.78 },
      { rate: 6, base: 123.5, vat: 7.41 },
    ]);
    expect(summary).toMatchObject({ exclVat: 1151, vat: 223.19, inclVat: 1374.19 });
  });

  it("is zero for an empty list", () => {
    expect(vatSummary([])).toEqual({ exclVat: 0, perRate: [], vat: 0, inclVat: 0 });
  });
});

describe("rebuildContentKeepingNotes", () => {
  const previous: InvoiceContent = {
    lines: [
      { item: { ...werkuren, quantity: 2 }, remark: "Inclusief afvoer" },
      { item: mini, remark: "Minigraver halve dag" },
    ],
    notes: ["Bedankt!"],
  };
  it("takes the new amounts and keeps the remark of the line with the same description", () => {
    const content = rebuildContentKeepingNotes({ lines: [{ item: { type: "item", ...werkuren } }], notes: [] }, previous);
    expect(content.lines).toHaveLength(1);
    expect(content.lines[0].item.quantity).toBe(15.5);
    expect(content.lines[0].remark).toBe("Inclusief afvoer");
  });
  it("a remark whose line disappeared and the free notes stay as notes (once)", () => {
    const content = rebuildContentKeepingNotes(
      { lines: [{ item: { type: "item", ...werkuren } }], notes: ["Bedankt!"] },
      previous,
    );
    expect(content.notes).toEqual(["Bedankt!", "Minigraver halve dag"]);
  });
});


describe("todo headings (invoice with several todos)", () => {
  const line = (description: string, extra: object = {}) => ({
    item: { description, quantity: 1, unit: "uur", amount: 45, tax_rate: 21 },
    ...extra,
  });

  it("a heading becomes a text line right above its line in EF, and survives validation", () => {
    const content = invoiceContentSchema.parse({ lines: [line("Werkuren", { heading: " Haag scheren " })], notes: [] });
    expect(content.lines[0].heading).toBe("Haag scheren");
    expect(itemsFromContent(content).map((i) => i.description)).toEqual(["Haag scheren", "Werkuren"]);
  });

  it("a rebuild keeps each remark with the same line of the same todo", () => {
    const previous = {
      lines: [
        line("Werkuren op 12/05/2027", { heading: "Haag scheren", remark: "Achterkant" }),
        line("Werkuren op 12/05/2027", { heading: "Gras afrijden", remark: "Voortuin" }),
      ],
      notes: [],
    };
    const item = (quantity: number) => ({ type: "item" as const, ...line("Werkuren op 12/05/2027").item, quantity });
    const built = {
      lines: [
        { item: item(2), heading: "Haag scheren" },
        { item: item(1), heading: "Gras afrijden" },
      ],
      notes: [],
    };
    const rebuilt = rebuildContentKeepingNotes(built, previous);
    expect(rebuilt.lines.map((l) => [l.heading, l.remark, l.item.quantity])).toEqual([
      ["Haag scheren", "Achterkant", 2],
      ["Gras afrijden", "Voortuin", 1],
    ]);
  });
});
