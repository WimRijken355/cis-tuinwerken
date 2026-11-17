import { describe, expect, it } from "vitest";
import { AUDITED_MODELS } from "../audit";
import { auditLogQuerySchema } from "./audit-log";

describe("auditLogQuerySchema", () => {
  it("vult page en pageSize met defaults aan zonder parameters", () => {
    const result = auditLogQuerySchema.parse({});
    expect(result.page).toBe(1);
    expect(result.pageSize).toBe(50);
    expect(result.table).toBeUndefined();
    expect(result.action).toBeUndefined();
  });

  it("aanvaardt elke auditbare tabelnaam", () => {
    for (const model of AUDITED_MODELS) {
      expect(auditLogQuerySchema.parse({ table: model }).table).toBe(model);
    }
  });

  it("weigert een niet-auditbare of onbestaande tabelnaam", () => {
    expect(() => auditLogQuerySchema.parse({ table: "User" })).toThrow();
    expect(() => auditLogQuerySchema.parse({ table: "NietsBestaand" })).toThrow();
  });

  it("aanvaardt enkel de drie geldige acties", () => {
    expect(auditLogQuerySchema.parse({ action: "CREATE" }).action).toBe("CREATE");
    expect(() => auditLogQuerySchema.parse({ action: "RENAME" })).toThrow();
  });

  it("beperkt pageSize tot maximaal 100", () => {
    expect(() => auditLogQuerySchema.parse({ pageSize: "500" })).toThrow();
  });

  it("zet string-querystring-waarden om naar getallen (coerce)", () => {
    const result = auditLogQuerySchema.parse({ page: "3", pageSize: "20" });
    expect(result.page).toBe(3);
    expect(result.pageSize).toBe(20);
  });
});
