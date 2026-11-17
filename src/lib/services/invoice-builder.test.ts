import { describe, expect, it } from "vitest";
import type { CompletionInput } from "../schemas/completions";
import { buildInvoiceLines } from "./invoice-builder";

function baseCompletion(overrides: Partial<CompletionInput> = {}): CompletionInput {
  return {
    ownHours: 2,
    workers: [],
    extras: [],
    ...overrides,
  };
}

describe("buildInvoiceLines", () => {
  it("bouwt één regel voor eigen uren met het juiste totaal", () => {
    const result = buildInvoiceLines({
      completion: baseCompletion({ ownHours: 3 }),
      workTitle: "Haag knippen",
      workDate: new Date("2026-06-15T10:00:00Z"),
      ownHourlyRate: 45,
      laborVatRate: 21,
    });

    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({
      quantity: 3,
      amount: 45,
      tax_rate: 21,
      unit: "uur",
    });
    expect(result.totalExclVat).toBe(135);
  });

  it("telt medewerkers en extra's mee in het totaal", () => {
    const result = buildInvoiceLines({
      completion: baseCompletion({
        ownHours: 2,
        workers: [{ name: "Jan", hours: 2, hourlyRate: 30 }],
        extras: [
          { description: "Afvoer groenafval", quantity: 1, unit: "beurt", unitPrice: 25, vatRate: 21 },
        ],
      }),
      workTitle: "Snoeiwerk",
      workDate: new Date("2026-06-15T10:00:00Z"),
      ownHourlyRate: 40,
      laborVatRate: 21,
    });

    expect(result.items).toHaveLength(3);
    // 2*40 + 2*30 + 1*25 = 165
    expect(result.totalExclVat).toBe(165);
  });

  it("rekent in centen zodat er geen float-drift ontstaat", () => {
    const result = buildInvoiceLines({
      completion: baseCompletion({ ownHours: 1.1 }),
      workTitle: "Test",
      workDate: new Date("2026-06-15T10:00:00Z"),
      ownHourlyRate: 10.1,
      laborVatRate: 21,
    });

    // 1.1 * 10.1 = 11.11, met floats zou dit 11.110000000000001 worden.
    expect(result.totalExclVat).toBe(11.11);
  });

  it("weigert een eenheid langer dan 10 tekens", () => {
    expect(() =>
      buildInvoiceLines({
        completion: baseCompletion({
          extras: [
            {
              description: "Iets",
              quantity: 1,
              unit: "veel-te-lange-eenheid",
              unitPrice: 10,
              vatRate: 21,
            },
          ],
        }),
        workTitle: "Test",
        workDate: new Date("2026-06-15T10:00:00Z"),
        ownHourlyRate: 40,
        laborVatRate: 21,
      }),
    ).toThrow(/Eenheid/);
  });

  it("weigert een niet-toegelaten btw-tarief", () => {
    expect(() =>
      buildInvoiceLines({
        completion: baseCompletion({
          extras: [{ description: "Iets", quantity: 1, unit: "stuk", unitPrice: 10, vatRate: 15 }],
        }),
        workTitle: "Test",
        workDate: new Date("2026-06-15T10:00:00Z"),
        ownHourlyRate: 40,
        laborVatRate: 21,
      }),
    ).toThrow(/btw-tarief/);
  });
});
