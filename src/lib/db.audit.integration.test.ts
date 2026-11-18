import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { setAuditUser } from "./audit-context";
import { db } from "./db";

/**
 * Integration test against a real Postgres (the audit extension in db.ts
 * relies on Prisma transaction behavior that can't be meaningfully mocked —
 * see the explanation in db.ts). Needs a reachable database via
 * DATABASE_URL (e.g. `npm run db:up`, see .env). If there isn't one (e.g.
 * in CI without a database), this test file skips itself instead of failing.
 */
let dbAvailable = true;
try {
  await db.$queryRaw`SELECT 1`;
} catch {
  dbAvailable = false;
}

describe.skipIf(!dbAvailable)("audit trail (integratie, echte database)", () => {
  let customerId: number;

  beforeAll(() => {
    setAuditUser(99);
  });

  afterAll(async () => {
    await db.auditLog.deleteMany({ where: { tableName: "Customer", recordId: String(customerId) } });
    await db.$disconnect();
  });

  it("logt een CREATE met before=null en de volledige nieuwe rij", async () => {
    const customer = await db.customer.create({ data: { name: "Audittest Klant" } });
    customerId = customer.id;

    const logs = await db.auditLog.findMany({
      where: { tableName: "Customer", recordId: String(customer.id) },
    });
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({ action: "CREATE", userId: 99, before: null });
    expect(logs[0].after).toMatchObject({ id: customer.id, name: "Audittest Klant" });
  });

  it("logt een UPDATE met zowel de oude als de nieuwe rij", async () => {
    await db.customer.update({ where: { id: customerId }, data: { name: "Audittest Klant BV" } });

    const logs = await db.auditLog.findMany({
      where: { tableName: "Customer", recordId: String(customerId) },
      orderBy: { id: "asc" },
    });
    expect(logs).toHaveLength(2);
    expect(logs[1].action).toBe("UPDATE");
    expect(logs[1].before).toMatchObject({ name: "Audittest Klant" });
    expect(logs[1].after).toMatchObject({ name: "Audittest Klant BV" });
  });

  it("logt een DELETE met de laatste rij als before en after=null", async () => {
    await db.customer.delete({ where: { id: customerId } });

    const logs = await db.auditLog.findMany({
      where: { tableName: "Customer", recordId: String(customerId) },
      orderBy: { id: "asc" },
    });
    expect(logs).toHaveLength(3);
    expect(logs[2]).toMatchObject({ action: "DELETE", after: null });
    expect(logs[2].before).toMatchObject({ name: "Audittest Klant BV" });
  });

  it("niet-auditbare modellen (bv. User) lekken nooit geheimen in de AuditLog", async () => {
    // Not creating a real User (could affect the seeded admin). User is not in
    // AUDITED_MODELS; the users routes write their own redacted rows
    // (username/role only), so rows may exist — but never with secrets.
    const rows = await db.auditLog.findMany({ where: { tableName: "User" } });
    for (const row of rows) {
      const json = JSON.stringify([row.before, row.after]);
      expect(json).not.toMatch(/passwordHash|totpSecret/);
    }
  });
});
