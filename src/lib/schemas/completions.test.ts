import { describe, expect, it } from "vitest";
import { completionInputSchema } from "./completions";

describe("completionInputSchema", () => {
  it("aanvaardt een minimale geldige invoer en vult defaults aan", () => {
    const result = completionInputSchema.parse({ ownHours: 2 });
    expect(result.ownHours).toBe(2);
    expect(result.workers).toEqual([]);
    expect(result.extras).toEqual([]);
  });

  it("rondt uren af op 2 decimalen", () => {
    const result = completionInputSchema.parse({ ownHours: 2.1234 });
    expect(result.ownHours).toBe(2.12);
  });

  it("weigert 0 of negatieve uren", () => {
    expect(() => completionInputSchema.parse({ ownHours: 0 })).toThrow();
    expect(() => completionInputSchema.parse({ ownHours: -1 })).toThrow();
  });

  it("weigert meer dan 24 uur op één dag", () => {
    expect(() => completionInputSchema.parse({ ownHours: 25 })).toThrow();
  });

  it("weigert een niet-toegelaten btw-tarief bij extra's", () => {
    expect(() =>
      completionInputSchema.parse({
        ownHours: 1,
        extras: [{ description: "X", quantity: 1, unit: "stuk", unitPrice: 10, vatRate: 9 }],
      }),
    ).toThrow();
  });

  it("aanvaardt een geldige extra en geldige medewerker", () => {
    const result = completionInputSchema.parse({
      ownHours: 1,
      workers: [{ name: "Jan", hours: 1, hourlyRate: 30 }],
      extras: [{ description: "Machine", quantity: 2, unit: "uur", unitPrice: 15, vatRate: 21 }],
    });
    expect(result.workers).toHaveLength(1);
    expect(result.extras).toHaveLength(1);
  });

  it("weigert een lege medewerkersnaam", () => {
    expect(() =>
      completionInputSchema.parse({
        ownHours: 1,
        workers: [{ name: "  ", hours: 1, hourlyRate: 30 }],
      }),
    ).toThrow();
  });
});
