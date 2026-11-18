import { describe, expect, it } from "vitest";
import {
  buildJobInvoice,
  ceilToQuarterHour,
  defaultInvoiceNow,
  periodToWindow,
  proposeHours,
  searchArticles,
  windowLabel,
} from "./registration";

describe("ceilToQuarterHour (per begonnen kwartier)", () => {
  it("rounds up to the next quarter", () => {
    expect(ceilToQuarterHour(1.1)).toBe(1.25);
    expect(ceilToQuarterHour(1.25)).toBe(1.25);
    expect(ceilToQuarterHour(1.26)).toBe(1.5);
    expect(ceilToQuarterHour(7.999)).toBe(8);
    expect(ceilToQuarterHour(0.01)).toBe(0.25);
  });

  it("keeps 0 (and invalid input) at 0, and survives float noise", () => {
    expect(ceilToQuarterHour(0)).toBe(0);
    expect(ceilToQuarterHour(Number.NaN)).toBe(0);
    expect(ceilToQuarterHour(0.1 + 0.2 + 0.95)).toBe(1.25); // 1.2500000000000002
  });
});

describe("proposeHours", () => {
  it("proposes the block length, capped by what is still open for the resource", () => {
    // Minigraver: 12 h on the whole job, 8 h block.
    expect(proposeHours({ blockMinutes: 480, resourceTodoHours: 12, alreadyRegisteredHours: 0 })).toBe(8);
    expect(proposeHours({ blockMinutes: 480, resourceTodoHours: 12, alreadyRegisteredHours: 8 })).toBe(4);
    expect(proposeHours({ blockMinutes: 480, resourceTodoHours: 12, alreadyRegisteredHours: 12 })).toBe(0);
    expect(proposeHours({ blockMinutes: 100, resourceTodoHours: 12, alreadyRegisteredHours: 0 })).toBe(1.75);
  });
});

describe("defaultInvoiceNow", () => {
  it("is on only for the last block of the job", () => {
    expect(defaultInvoiceNow({ otherPlannedBlocks: 0, remainingUnplannedMinutes: 0 })).toBe(true);
    expect(defaultInvoiceNow({ otherPlannedBlocks: 2, remainingUnplannedMinutes: 0 })).toBe(false);
    expect(defaultInvoiceNow({ otherPlannedBlocks: 0, remainingUnplannedMinutes: 240 })).toBe(false);
  });
});

describe("buildJobInvoice", () => {
  const cis = { resourceId: 1, name: "Cis", type: "PERSON" as const, hourlyRate: 45, vatRate: 21 };
  const wim = { resourceId: 2, name: "Wim", type: "PERSON" as const, hourlyRate: 45, vatRate: 21 };
  const ken = { resourceId: 3, name: "Ken", type: "PERSON" as const, hourlyRate: 35, vatRate: 21 };
  const mini = { resourceId: 9, name: "Minigraver", type: "MACHINE" as const, hourlyRate: 55, vatRate: 21 };
  const day1 = "2026-12-07T07:00:00Z";
  const day2 = "2026-12-08T07:00:00Z";

  it("sums the people's hours per day into 'Werkuren op <datum>', machines apart per day", () => {
    const built = buildJobInvoice({
      days: [
        // Given out of order on purpose.
        { date: day2, labor: [{ ...cis, invoicedHours: 6 }, { ...mini, invoicedHours: 4 }], extras: [] },
        { date: day1, labor: [{ ...cis, invoicedHours: 8 }, { ...wim, invoicedHours: 7.5 }, { ...mini, invoicedHours: 8 }], extras: [] },
      ],
    });
    expect(built.items).toEqual([
      { type: "item", description: "Werkuren op 07/12/2026", quantity: 15.5, unit: "uur", amount: 45, tax_rate: 21 },
      { type: "item", description: "Minigraver op 07/12/2026", quantity: 8, unit: "uur", amount: 55, tax_rate: 21 },
      { type: "item", description: "Werkuren op 08/12/2026", quantity: 6, unit: "uur", amount: 45, tax_rate: 21 },
      { type: "item", description: "Minigraver op 08/12/2026", quantity: 4, unit: "uur", amount: 55, tax_rate: 21 },
    ]);
    expect(built.totalExclVat).toBe(21.5 * 45 + 12 * 55);
  });

  it("keeps the per-person composition for consultation (not sent to EF)", () => {
    const built = buildJobInvoice({
      days: [{ date: day1, labor: [{ ...cis, invoicedHours: 8 }, { ...wim, invoicedHours: 7.5 }], extras: [] }],
    });
    expect(built.lines[0]).toMatchObject({
      key: "labor|2026-12-07|45|21",
      kind: "labor",
      details: [
        { name: "Cis", hours: 8 },
        { name: "Wim", hours: 7.5 },
      ],
    });
    expect(JSON.stringify(built.items)).not.toContain("Wim");
  });

  it("makes one 'Werkuren' line per hourly rate when rates differ that day", () => {
    const built = buildJobInvoice({
      days: [{ date: day1, labor: [{ ...cis, invoicedHours: 8 }, { ...ken, invoicedHours: 8 }], extras: [] }],
    });
    expect(built.items.map((i) => [i.description, i.quantity, i.amount])).toEqual([
      ["Werkuren op 07/12/2026", 8, 45],
      ["Werkuren op 07/12/2026", 8, 35],
    ]);
    expect(built.totalExclVat).toBe(8 * 45 + 8 * 35);
  });

  it("adds a remark as a text line below its line, and notes at the bottom", () => {
    const built = buildJobInvoice({
      days: [{ date: day1, labor: [{ ...cis, invoicedHours: 8 }, { ...mini, invoicedHours: 2 }], extras: [] }],
      remarks: { "machine|9|2026-12-07|55|21": "incl. transport", "labor|2026-12-07|45|21": "  " },
      notes: ["Bedankt voor het vertrouwen!", " "],
    });
    expect(built.items).toEqual([
      { type: "item", description: "Werkuren op 07/12/2026", quantity: 8, unit: "uur", amount: 45, tax_rate: 21 },
      { type: "item", description: "Minigraver op 07/12/2026", quantity: 2, unit: "uur", amount: 55, tax_rate: 21 },
      { type: "text", description: "incl. transport" },
      { type: "text", description: "Bedankt voor het vertrouwen!" },
    ]);
    // Text lines do not change the total.
    expect(built.totalExclVat).toBe(8 * 45 + 2 * 55);
  });

  it("never loses a remark: one for a line that no longer exists becomes a note", () => {
    const built = buildJobInvoice({
      days: [{ date: day1, labor: [{ ...cis, invoicedHours: 1 }], extras: [] }],
      remarks: { "machine|9|2026-12-07|55|21": "minigraver kwam niet" },
    });
    expect(built.notes).toEqual(["minigraver kwam niet"]);
    expect(built.items.at(-1)).toEqual({ type: "text", description: "minigraver kwam niet" });
  });

  it("leaves out 0 invoiced hours and sums extras over the job, exact in cents", () => {
    const afvoer = { priceListItemId: 3, description: "Afvoer groenafval", unit: "m³", unitPrice: 35.1, vatRate: 21 };
    const built = buildJobInvoice({
      days: [
        { date: day1, labor: [{ ...cis, invoicedHours: 0 }], extras: [{ ...afvoer, quantity: 1.5 }] },
        { date: day2, labor: [], extras: [{ ...afvoer, quantity: 1.5 }] },
      ],
    });
    expect(built.items).toEqual([
      { type: "item", description: "Afvoer groenafval", quantity: 3, unit: "m³", amount: 35.1, tax_rate: 21 },
    ]);
    expect(built.totalExclVat).toBe(105.3);
  });

  it("keeps an edited article description as its own line", () => {
    const base = { priceListItemId: 7, unit: "m²", unitPrice: 9, vatRate: 21 };
    const built = buildJobInvoice({
      days: [
        { date: day1, labor: [], extras: [{ ...base, description: "Graszoden", quantity: 10 }] },
        { date: day2, labor: [], extras: [{ ...base, description: "Graszoden schaduwmengsel", quantity: 5 }] },
      ],
    });
    expect(built.items.map((i) => i.description)).toEqual(["Graszoden", "Graszoden schaduwmengsel"]);
  });

  it("enforces the EF limits", () => {
    expect(() =>
      buildJobInvoice({ days: [{ date: day1, labor: [{ ...cis, vatRate: 15, invoicedHours: 1 }], extras: [] }] }),
    ).toThrow("btw");
  });
});

describe("preferred period", () => {
  it("turns months into a window and a label", () => {
    const w = periodToWindow("2027-04");
    expect(w.windowStart.toISOString()).toBe("2027-04-01T00:00:00.000Z");
    expect(w.windowEnd.toISOString()).toBe("2027-04-30T00:00:00.000Z");
    expect(windowLabel(w.windowStart, w.windowEnd)).toBe("apr 2027");
  });

  it("supports ranges, also over a year boundary, and swapped months", () => {
    const range = periodToWindow("2027-06", "2027-04");
    expect(windowLabel(range.windowStart, range.windowEnd)).toBe("apr–jun 2027");
    const winter = periodToWindow("2026-11", "2027-02");
    expect(winter.windowEnd.toISOString()).toBe("2027-02-28T00:00:00.000Z");
    expect(windowLabel(winter.windowStart, winter.windowEnd)).toBe("nov 2026–feb 2027");
    expect(windowLabel(null, null)).toBeNull();
  });
});

describe("searchArticles", () => {
  const items = [
    { id: 1, name: "Graszoden" },
    { id: 2, name: "Afvoer groenafval" },
    { id: 3, name: "Barenbrug RPR (graszaad)" },
    { id: 4, name: "Béton herstel" },
  ];

  it("matches all words, case- and accent-insensitive, alphabetically", () => {
    expect(searchArticles(items, "gras", new Set()).results.map((i) => i.id)).toEqual([3, 1]);
    expect(searchArticles(items, "GRAS zaad", new Set()).results.map((i) => i.id)).toEqual([3]);
    expect(searchArticles(items, "beton", new Set()).results.map((i) => i.id)).toEqual([4]);
  });

  it("leaves out selected items and limits the list", () => {
    expect(searchArticles(items, "", new Set([2, 4])).results.map((i) => i.id)).toEqual([3, 1]);
    expect(searchArticles(items, "", new Set(), 2)).toMatchObject({ more: true });
    expect(searchArticles(items, "", new Set(), 2).results).toHaveLength(2);
  });
});
