import { describe, expect, it } from "vitest";
import {
  buildInvoice,
  buildJobInvoice,
  defaultTogetherTodoIds,
  invoiceTogetherProblem,
  ceilToHalfDay,
  extrasTotal,
  isBillableLabor,
  laborDescription,
  ceilToQuarterHour,
  closeJobCheck,
  defaultInvoiceNow,
  followUpTodoInitial,
  hoursFromTimeRange,
  jobOutcome,
  periodToWindow,
  proposeHours,
  searchArticles,
  selectQuoteLines,
  toggleId,
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

describe("hoursFromTimeRange", () => {
  it("computes hours between two clock times, per started quarter", () => {
    expect(hoursFromTimeRange("08:00", "12:00")).toBe(4);
    expect(hoursFromTimeRange("08:00", "12:10")).toBe(4.25);
    expect(hoursFromTimeRange("08:15", "16:00")).toBe(7.75);
  });

  it("yields 0 when 'tot' is not after 'van', or on invalid input", () => {
    expect(hoursFromTimeRange("12:00", "12:00")).toBe(0);
    expect(hoursFromTimeRange("14:00", "08:00")).toBe(0);
    expect(hoursFromTimeRange("", "12:00")).toBe(0);
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

  it("adds the chosen quote lines after the work, each as offered, with remarks by key", () => {
    const built = buildJobInvoice({
      days: [{ date: day1, labor: [{ ...cis, invoicedHours: 2 }], extras: [] }],
      quoteLines: [
        { linkId: 7, description: "Gazon aanleggen", quantity: 80, unit: "m²", amount: 12.5, taxRate: 6 },
        { linkId: 8, description: "Sproeiers", quantity: 5, unit: "sproeierkop-xl", amount: 36, taxRate: 21 },
      ],
      remarks: { "quote|7": "Zie offerte OFF-2026-012" },
    });
    expect(built.items).toEqual([
      { type: "item", description: "Werkuren op 07/12/2026", quantity: 2, unit: "uur", amount: 45, tax_rate: 21 },
      { type: "item", description: "Gazon aanleggen", quantity: 80, unit: "m²", amount: 12.5, tax_rate: 6 },
      { type: "text", description: "Zie offerte OFF-2026-012" },
      { type: "item", description: "Sproeiers", quantity: 5, unit: "sproeierko", amount: 36, tax_rate: 21 },
    ]);
    expect(built.lines.filter((l) => l.kind === "quote").map((l) => l.key)).toEqual(["quote|7", "quote|8"]);
    expect(built.totalExclVat).toBe(2 * 45 + 80 * 12.5 + 5 * 36);
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

  it("shows days for a weekly/monthly occurrence window", () => {
    expect(windowLabel("2027-05-12", "2027-05-18")).toBe("12–18 mei 2027");
    expect(windowLabel("2027-04-28", "2027-05-04")).toBe("28 apr–4 mei 2027");
    expect(windowLabel("2027-12-28", "2028-01-03")).toBe("28 dec 2027–3 jan 2028");
    expect(windowLabel("2027-05-12", "2027-05-12")).toBe("12 mei 2027");
    // A monthly occurrence from the 1st to the last day still reads as the month.
    expect(windowLabel("2027-06-01", "2027-06-30")).toBe("jun 2027");
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

describe("jobOutcome", () => {
  it("invoicing always closes the job", () => {
    expect(jobOutcome(true, false)).toBe("invoice");
    expect(jobOutcome(true, undefined)).toBe("invoice");
  });
  it("finished without invoice closes the todo; otherwise it continues", () => {
    expect(jobOutcome(false, true)).toBe("close");
    expect(jobOutcome(false, false)).toBe("continue");
    expect(jobOutcome(false, undefined)).toBe("continue");
  });
  it("a project is never invoiced here: invoicing becomes closing", () => {
    expect(jobOutcome(true, true, true)).toBe("close");
    expect(jobOutcome(true, undefined, true)).toBe("close");
    expect(jobOutcome(false, true, true)).toBe("close");
    expect(jobOutcome(false, false, true)).toBe("continue");
  });
});

describe("closeJobCheck", () => {
  const base = { status: "OPEN" as const, hasCustomer: true, plannedBlocks: 0, registeredDays: 1, uninvoicedDays: 1, hasBillable: true };
  it("a registered, unplanned job can be invoiced or closed without invoice", () => {
    expect(closeJobCheck(base, true).allowed).toBe(true);
    expect(closeJobCheck(base, false).allowed).toBe(true);
  });
  it("not while blocks are still planned, nor without any registration", () => {
    expect(closeJobCheck({ ...base, status: "PLANNED", plannedBlocks: 1 }, true).allowed).toBe(false);
    expect(closeJobCheck({ ...base, registeredDays: 0, uninvoicedDays: 0 }, false).allowed).toBe(false);
  });
  it("a job closed without invoice can still be invoiced, but not closed twice", () => {
    const done = { ...base, status: "DONE" as const };
    expect(closeJobCheck(done, true).allowed).toBe(true);
    expect(closeJobCheck(done, false).allowed).toBe(false);
    expect(closeJobCheck({ ...done, uninvoicedDays: 0 }, true).allowed).toBe(false);
  });
  it("losse todo's and cancelled todos are never invoiced", () => {
    expect(closeJobCheck({ ...base, hasCustomer: false }, true).allowed).toBe(false);
    expect(closeJobCheck({ ...base, status: "CANCELLED" }, true).allowed).toBe(false);
  });
  it("a project is invoiced in EF: closing is fine, invoicing from the app is refused", () => {
    const check = closeJobCheck({ ...base, isProject: true }, true);
    expect(check).toEqual({ allowed: false, reason: expect.stringContaining("EenvoudigFactureren") });
    expect(closeJobCheck({ ...base, isProject: true }, false).allowed).toBe(true);
  });
  it("nothing billable (0 invoiced hours, no articles): no invoice, but closing is fine", () => {
    expect(closeJobCheck({ ...base, hasBillable: false }, true).allowed).toBe(false);
    expect(closeJobCheck({ ...base, hasBillable: false }, false).allowed).toBe(true);
  });
});

describe("followUpTodoInitial", () => {
  const todo = {
    title: "Haag scheren",
    estimatedHours: 2,
    resources: [{ resourceId: 1, name: "Cis", type: "PERSON" as const, hours: 2 }],
    tasks: [
      { id: 1, checklistItemId: 10, label: "Snoeien", done: true },
      { id: 2, checklistItemId: 11, label: "Afvoeren", done: false },
      { id: 3, checklistItemId: 12, label: "Onkruid", done: true, unplanned: true },
      { id: 4, checklistItemId: 10, label: "Snoeien", done: true, unplanned: true },
      { id: 5, checklistItemId: null, label: "Vrije taak", done: true },
    ],
  };
  it("copies title, time and resources", () => {
    const init = followUpTodoInitial(todo);
    expect(init.title).toBe("Haag scheren");
    expect(init.estimatedHours).toBe(2);
    expect(init.resources).toEqual(todo.resources);
    expect(init.resources[0]).not.toBe(todo.resources[0]);
  });
  it("takes planned + extra checklist tasks once, unticked, without free-text tasks", () => {
    const init = followUpTodoInitial(todo);
    expect(init.tasks.map((t) => t.checklistItemId)).toEqual([10, 11, 12]);
    expect(init.tasks.every((t) => !t.done && !t.unplanned)).toBe(true);
  });
});

describe("quote lines in the invoice step", () => {
  const lines = [
    { linkId: 1, invoiceId: null },
    { linkId: 2, invoiceId: null },
    { linkId: 3, invoiceId: 40 },
  ];
  it("invoices only the ticked lines that are not on an invoice yet", () => {
    expect(selectQuoteLines(lines, new Set([1, 3])).map((l) => l.linkId)).toEqual([1]);
    expect(selectQuoteLines(lines, new Set())).toEqual([]);
  });
  it("toggleId adds and removes without mutating the original set", () => {
    const ids = new Set([1]);
    expect([...toggleId(ids, 2)]).toEqual([1, 2]);
    expect([...toggleId(ids, 1)]).toEqual([]);
    expect([...ids]).toEqual([1]);
  });
});

describe("samen factureren (several todos on one invoice)", () => {
  const cis = { resourceId: 1, name: "Cis", type: "PERSON" as const, hourlyRate: 45, vatRate: 21 };
  const day = "2027-05-12T07:00:00Z";
  const hedge = { todoId: 11, title: "Haag scheren", days: [{ date: day, labor: [{ ...cis, invoicedHours: 3 }], extras: [] }] };
  const grass = {
    todoId: 12,
    title: "Gras afrijden",
    days: [{ date: day, labor: [{ ...cis, invoicedHours: 1.5 }], extras: [] }],
    quoteLines: [{ linkId: 5, description: "Graszaad", quantity: 2, unit: "kg", amount: 8, taxRate: 6 }],
  };

  it("groups the lines per todo under a title line, with remarks staying in their own group", () => {
    const built = buildInvoice({
      jobs: [hedge, grass],
      remarks: { "todo12|labor|2027-05-12|45|21": "Enkel voortuin" },
      notes: ["Bedankt!"],
    });
    expect(built.items).toEqual([
      { type: "text", description: "Haag scheren" },
      { type: "item", description: "Werkuren op 12/05/2027", quantity: 3, unit: "uur", amount: 45, tax_rate: 21 },
      { type: "text", description: "Gras afrijden" },
      { type: "item", description: "Werkuren op 12/05/2027", quantity: 1.5, unit: "uur", amount: 45, tax_rate: 21 },
      { type: "text", description: "Enkel voortuin" },
      { type: "item", description: "Graszaad", quantity: 2, unit: "kg", amount: 8, tax_rate: 6 },
      { type: "text", description: "Bedankt!" },
    ]);
    expect(built.lines.map((l) => [l.key, l.heading ?? null, l.group])).toEqual([
      ["todo11|labor|2027-05-12|45|21", "Haag scheren", "Haag scheren"],
      ["todo12|labor|2027-05-12|45|21", "Gras afrijden", "Gras afrijden"],
      ["todo12|quote|5", null, "Gras afrijden"],
    ]);
    expect(built.totalExclVat).toBe(4.5 * 45 + 16);
  });

  it("a single todo stays exactly as before (no title line, no key prefix)", () => {
    expect(buildInvoice({ jobs: [hedge] })).toEqual(buildJobInvoice({ days: hedge.days }));
  });

  it("a todo without anything to charge gets no title line", () => {
    const empty = { todoId: 13, title: "Leeg", days: [{ date: day, labor: [{ ...cis, invoicedHours: 0 }], extras: [] }] };
    const built = buildInvoice({ jobs: [hedge, empty] });
    expect(built.items.filter((i) => i.type === "text").map((i) => i.description)).toEqual(["Haag scheren"]);
  });

  it("ticks other work of the same Brussels day by default, not older work", () => {
    const jobs = [
      { todoId: 1, lastRegisteredOn: "2027-05-12T06:00:00Z" },
      { todoId: 2, lastRegisteredOn: "2027-05-11T21:30:00Z" }, // 23:30 Brussels on the 11th
      { todoId: 3, lastRegisteredOn: "2027-05-11T22:30:00Z" }, // 00:30 Brussels on the 12th
    ];
    expect(defaultTogetherTodoIds(jobs, "2027-05-12T13:00:00Z")).toEqual([1, 3]);
  });

  it("only finished, non-project todos of the same customer with something to invoice", () => {
    const ok = { customerId: 7, status: "DONE", isProject: false, uninvoicedDays: 1 };
    expect(invoiceTogetherProblem(ok, 7)).toBeNull();
    expect(invoiceTogetherProblem({ ...ok, customerId: 8 }, 7)).toMatch(/andere klant/);
    expect(invoiceTogetherProblem({ ...ok, isProject: true }, 7)).toMatch(/project/);
    expect(invoiceTogetherProblem({ ...ok, status: "OPEN" }, 7)).toMatch(/afgewerkte/);
    expect(invoiceTogetherProblem({ ...ok, uninvoicedDays: 0 }, 7)).toMatch(/niets meer/);
  });
});

describe("facturatieomschrijving (todo's own description for the labour lines)", () => {
  const cis = { resourceId: 1, name: "Cis", type: "PERSON" as const, hourlyRate: 45, vatRate: 21 };
  const mini = { resourceId: 9, name: "Minigraver", type: "MACHINE" as const, hourlyRate: 55, vatRate: 21 };
  const d1 = "2027-05-12T07:00:00Z";
  const d2 = "2027-05-13T07:00:00Z";

  it("empty = the default; set = used as is for a single day, with the date for several days", () => {
    expect(laborDescription(null, "12/05/2027", false)).toBe("Werkuren op 12/05/2027");
    expect(laborDescription("  ", "12/05/2027", true)).toBe("Werkuren op 12/05/2027");
    expect(laborDescription("Tuinonderhoud", "12/05/2027", false)).toBe("Tuinonderhoud");
    expect(laborDescription("Tuinonderhoud", "12/05/2027", true)).toBe("Tuinonderhoud (12/05/2027)");
  });

  it("replaces 'Werkuren op' on the invoice, but never the machine lines", () => {
    const oneDay = buildJobInvoice({
      days: [{ date: d1, labor: [{ ...cis, invoicedHours: 3 }, { ...mini, invoicedHours: 2 }], extras: [] }],
      invoiceDescription: "Tuinonderhoud volgens afspraak",
    });
    expect(oneDay.items.map((i) => i.description)).toEqual(["Tuinonderhoud volgens afspraak", "Minigraver op 12/05/2027"]);

    const twoDays = buildJobInvoice({
      days: [
        { date: d1, labor: [{ ...cis, invoicedHours: 3 }], extras: [] },
        { date: d2, labor: [{ ...cis, invoicedHours: 2 }], extras: [] },
      ],
      invoiceDescription: "Tuinonderhoud",
    });
    expect(twoDays.items.map((i) => i.description)).toEqual(["Tuinonderhoud (12/05/2027)", "Tuinonderhoud (13/05/2027)"]);
  });

  it("each todo keeps its own description when invoicing together", () => {
    const built = buildInvoice({
      jobs: [
        { todoId: 1, title: "Haag", invoiceDescription: "Haag scheren", days: [{ date: d1, labor: [{ ...cis, invoicedHours: 2 }], extras: [] }] },
        { todoId: 2, title: "Gras", days: [{ date: d1, labor: [{ ...cis, invoicedHours: 1 }], extras: [] }] },
      ],
    });
    expect(built.items.filter((i) => i.type === "item").map((i) => i.description)).toEqual([
      "Haag scheren",
      "Werkuren op 12/05/2027",
    ]);
  });
});

describe("day rate (machines)", () => {
  const cis = { resourceId: 1, name: "Cis", type: "PERSON" as const, hourlyRate: 45, vatRate: 21 };
  const mini = { resourceId: 9, name: "Minigraver", type: "MACHINE" as const, hourlyRate: 180, vatRate: 21, rateUnit: "DAY" as const };
  const d1 = "2027-05-12T07:00:00Z";
  const d2 = "2027-05-13T07:00:00Z";

  it("charges days, not hours: one line per machine and day", () => {
    const built = buildJobInvoice({
      days: [
        { date: d1, labor: [{ ...cis, invoicedHours: 8 }, { ...mini, invoicedHours: 6, invoicedDays: 1 }], extras: [] },
        { date: d2, labor: [{ ...mini, invoicedHours: 3, invoicedDays: 0.5 }], extras: [] },
      ],
    });
    expect(built.items).toEqual([
      { type: "item", description: "Werkuren op 12/05/2027", quantity: 8, unit: "uur", amount: 45, tax_rate: 21 },
      { type: "item", description: "Minigraver op 12/05/2027", quantity: 1, unit: "dag", amount: 180, tax_rate: 21 },
      { type: "item", description: "Minigraver op 13/05/2027", quantity: 0.5, unit: "dag", amount: 180, tax_rate: 21 },
    ]);
    expect(built.totalExclVat).toBe(8 * 45 + 1.5 * 180);
  });

  it("0 days = not on the invoice; a day-rate line alone does not count as 'Werkuren' days", () => {
    const built = buildJobInvoice({
      days: [
        { date: d1, labor: [{ ...cis, invoicedHours: 2 }, { ...mini, invoicedHours: 6, invoicedDays: 0 }], extras: [] },
        { date: d2, labor: [{ ...mini, invoicedHours: 6, invoicedDays: 1 }], extras: [] },
      ],
      invoiceDescription: "Tuinonderhoud",
    });
    // Labour on one day only → the description without a date.
    expect(built.items.map((i) => i.description)).toEqual(["Tuinonderhoud", "Minigraver op 13/05/2027"]);
  });

  it("billable = days > 0 for a day rate, hours > 0 otherwise; half-day rounding", () => {
    expect(isBillableLabor({ rateUnit: "DAY", invoicedHours: 6, invoicedDays: 0 })).toBe(false);
    expect(isBillableLabor({ rateUnit: "DAY", invoicedHours: 0, invoicedDays: 0.5 })).toBe(true);
    expect(isBillableLabor({ rateUnit: "HOUR", invoicedHours: 1 })).toBe(true);
    expect(ceilToHalfDay(0.3)).toBe(0.5);
    expect(ceilToHalfDay(1)).toBe(1);
    expect(ceilToHalfDay(1.2)).toBe(1.5);
  });
});

describe("VAT rate per line in the invoice step", () => {
  const cis = { resourceId: 1, name: "Cis", type: "PERSON" as const, hourlyRate: 45, vatRate: 21 };
  const day = "2027-05-12T07:00:00Z";
  const days = [
    {
      date: day,
      labor: [{ ...cis, invoicedHours: 4 }],
      extras: [{ priceListItemId: 3, description: "Graszaad", quantity: 2, unit: "kg", unitPrice: 8, vatRate: 21 }],
    },
  ];

  it("a rate chosen for a line key overrides that line only", () => {
    const built = buildJobInvoice({ days, vatRates: { "labor|2027-05-12|45|21": 6 } });
    expect(built.items.map((i) => [i.description, i.tax_rate])).toEqual([
      ["Werkuren op 12/05/2027", 6],
      ["Graszaad", 21],
    ]);
  });

  it("ignores unsupported rates and unknown keys", () => {
    const built = buildJobInvoice({ days, vatRates: { "labor|2027-05-12|45|21": 15, "nope": 6 } });
    expect(built.items.map((i) => i.tax_rate)).toEqual([21, 21]);
  });

  it("works with grouped invoices (prefixed keys)", () => {
    const built = buildInvoice({
      jobs: [
        { todoId: 1, title: "Haag", days },
        { todoId: 2, title: "Gras", days },
      ],
      vatRates: { "todo2|labor|2027-05-12|45|21": 6 },
    });
    expect(built.items.filter((i) => i.type === "item").map((i) => i.tax_rate)).toEqual([21, 21, 6, 21]);
  });
});

describe("extrasTotal (articles step)", () => {
  it("sums quantity × price in cents, without float drift", () => {
    expect(extrasTotal([])).toBe(0);
    expect(extrasTotal([{ quantity: 3, unitPrice: 0.1 }, { quantity: 2.5, unitPrice: 8.99 }])).toBe(22.78);
  });
});
