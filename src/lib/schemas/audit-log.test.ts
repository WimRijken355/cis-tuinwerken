import { describe, expect, it } from "vitest";
import { AUDITED_MODELS } from "../audit";
import { auditLogQuerySchema, buildAuditLogWhere, changedFields } from "./audit-log";

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

describe("buildAuditLogWhere", () => {
  it("treats empty filter values from the UI as 'no filter'", () => {
    const q = auditLogQuerySchema.parse({ table: "", action: "", user: "", recordId: "", from: "", to: "" });
    expect(buildAuditLogWhere(q)).toEqual({});
  });

  it("filters on table, action, user and record id", () => {
    const q = auditLogQuerySchema.parse({ table: "Customer", action: "UPDATE", user: "3", recordId: " 42 " });
    expect(buildAuditLogWhere(q)).toEqual({
      tableName: "Customer",
      action: "UPDATE",
      userId: 3,
      recordId: "42",
    });
  });

  it("maps user=system to background-job rows (userId NULL)", () => {
    expect(buildAuditLogWhere(auditLogQuerySchema.parse({ user: "system" }))).toEqual({ userId: null });
  });

  it("uses an inclusive Brussels day range for from/to", () => {
    // 18 Nov 2026 in Brussels is UTC+1: the day runs 17 Nov 23:00Z – 18 Nov 23:00Z.
    const where = buildAuditLogWhere(auditLogQuerySchema.parse({ from: "2026-11-18", to: "2026-11-18" }));
    expect(where.createdAt).toEqual({
      gte: new Date("2026-11-17T23:00:00.000Z"),
      lt: new Date("2026-11-18T23:00:00.000Z"),
    });
  });

  it("rejects a malformed date", () => {
    expect(() => auditLogQuerySchema.parse({ from: "18/11/2026" })).toThrow();
  });
});

describe("changedFields", () => {
  it("lists the fields that differ, ignoring updatedAt", () => {
    expect(
      changedFields(
        { id: 1, name: "Jan", city: "Gent", updatedAt: "a" },
        { id: 1, name: "Jan", city: "Brugge", updatedAt: "b", email: "jan@x.be" },
      ),
    ).toEqual(["city", "email"]);
  });

  it("returns nothing when a side is missing (CREATE/DELETE)", () => {
    expect(changedFields(null, { id: 1 })).toEqual([]);
    expect(changedFields({ id: 1 }, null)).toEqual([]);
  });
});
