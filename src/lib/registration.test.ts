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
  const wim = { resourceId: 2, name: "Wim", type: "PERSON" as const, hourlyRate: 35, vatRate: 21 };
  const mini = { resourceId: 9, name: "Minigraver", type: "MACHINE" as const, hourlyRate: 55, vatRate: 21 };

  it("sums the invoiced hours per resource over all days, with the dates", () => {
    const built = buildJobInvoice({
      workTitle: "Vijver aanleggen",
      days: [
        // Given out of order on purpose.
        { date: "2026-11-20T07:00:00Z", labor: [{ ...cis, invoicedHours: 6 }, { ...mini, invoicedHours: 4 }], extras: [] },
        { date: "2026-11-19T07:00:00Z", labor: [{ ...cis, invoicedHours: 8 }, { ...wim, invoicedHours: 8 }, { ...mini, invoicedHours: 8 }], extras: [] },
      ],
    });
    expect(built.items).toEqual([
      { type: "item", description: "Werkuren Cis – Vijver aanleggen (19/11, 20/11)", quantity: 14, unit: "uur", amount: 45, tax_rate: 21 },
      { type: "item", description: "Werkuren Wim – Vijver aanleggen (19/11)", quantity: 8, unit: "uur", amount: 35, tax_rate: 21 },
      { type: "item", description: "Minigraver – Vijver aanleggen (19/11, 20/11)", quantity: 12, unit: "uur", amount: 55, tax_rate: 21 },
    ]);
    expect(built.totalExclVat).toBe(14 * 45 + 8 * 35 + 12 * 55);
  });

  it("leaves out resources with 0 invoiced hours (registered only)", () => {
    const built = buildJobInvoice({
      workTitle: "X",
      days: [{ date: "2026-11-19T07:00:00Z", labor: [{ ...cis, invoicedHours: 2 }, { ...wim, invoicedHours: 0 }], extras: [] }],
    });
    expect(built.items).toHaveLength(1);
  });

  it("sums extras per article and keeps money exact in cents", () => {
    const afvoer = { priceListItemId: 3, description: "Afvoer groenafval", unit: "m³", unitPrice: 35.1, vatRate: 21 };
    const built = buildJobInvoice({
      workTitle: "X",
      days: [
        { date: "2026-11-19T07:00:00Z", labor: [], extras: [{ ...afvoer, quantity: 1.5 }] },
        { date: "2026-11-20T07:00:00Z", labor: [], extras: [{ ...afvoer, quantity: 1.5 }] },
      ],
    });
    expect(built.items).toEqual([
      { type: "item", description: "Afvoer groenafval", quantity: 3, unit: "m³", amount: 35.1, tax_rate: 21 },
    ]);
    expect(built.totalExclVat).toBe(105.3);
  });

  it("enforces the EF limits", () => {
    expect(() =>
      buildJobInvoice({
        workTitle: "X",
        days: [{ date: "2026-11-19T07:00:00Z", labor: [{ ...cis, vatRate: 15, invoicedHours: 1 }], extras: [] }],
      }),
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
