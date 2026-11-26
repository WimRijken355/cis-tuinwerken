import { describe, expect, it } from "vitest";
import {
  manualStatusOptions,
  manualStatusTarget,
  manualStatusValue,
  manualStatusWarning,
  manualTodoStatusSchema,
} from "./todo-status";

describe("manualStatusTarget", () => {
  it("in te plannen / ingepland volgen de planning", () => {
    expect(manualStatusTarget("OPEN", 2)).toBe("PLANNED");
    expect(manualStatusTarget("PLANNED", 0)).toBe("OPEN");
    expect(manualStatusTarget("OPEN", 0)).toBe("OPEN");
  });

  it("klaar en geannuleerd blijven wat gekozen werd, ook met geplande blokken", () => {
    expect(manualStatusTarget("DONE", 3)).toBe("DONE");
    expect(manualStatusTarget("CANCELLED", 1)).toBe("CANCELLED");
  });
});

describe("manualStatusOptions / manualStatusValue", () => {
  it("toont één open keuze volgens de planning, plus klaar en geannuleerd", () => {
    expect(manualStatusOptions(0).map((o) => o.label)).toEqual(["In te plannen", "Klaar", "Geannuleerd"]);
    expect(manualStatusOptions(2).map((o) => o.label)).toEqual(["Ingepland", "Klaar", "Geannuleerd"]);
  });

  it("selecteert altijd een bestaande keuze", () => {
    expect(manualStatusValue("OPEN", 1)).toBe("PLANNED");
    expect(manualStatusValue("DONE", 1)).toBe("DONE");
    for (const status of ["OPEN", "PLANNED", "DONE", "CANCELLED"] as const) {
      for (const planned of [0, 2]) {
        const values = manualStatusOptions(planned).map((o) => o.value);
        expect(values).toContain(manualStatusValue(status, planned));
      }
    }
  });
});

describe("manualStatusWarning", () => {
  const ctx = { plannedBlocks: 0, uninvoicedDays: 0, invoiceable: true };

  it("vraagt niets bij heropenen of zonder gevolgen", () => {
    expect(manualStatusWarning("OPEN", { ...ctx, plannedBlocks: 2 })).toBeNull();
    expect(manualStatusWarning("DONE", ctx)).toBeNull();
    expect(manualStatusWarning("DONE", { ...ctx, uninvoicedDays: 2 })).toBeNull();
  });

  it("waarschuwt dat geplande blokken uit de planning gaan", () => {
    expect(manualStatusWarning("DONE", { ...ctx, plannedBlocks: 1 })).toContain("Het geplande blok");
    expect(manualStatusWarning("CANCELLED", { ...ctx, plannedBlocks: 3 })).toContain("De 3 geplande blokken");
  });

  it("waarschuwt bij annuleren van nog niet gefactureerd werk (niet bij een project)", () => {
    expect(manualStatusWarning("CANCELLED", { ...ctx, uninvoicedDays: 1 })).toContain("niet meer gefactureerd");
    expect(manualStatusWarning("CANCELLED", { ...ctx, uninvoicedDays: 1, invoiceable: false })).toBeNull();
  });
});

describe("manualTodoStatusSchema", () => {
  it("aanvaardt enkel de vier statussen", () => {
    expect(manualTodoStatusSchema.parse({ status: "DONE" }).status).toBe("DONE");
    expect(() => manualTodoStatusSchema.parse({ status: "KLAAR" })).toThrow();
  });
});
