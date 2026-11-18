import { describe, expect, it, vi } from "vitest";
import { beginAuditScope, getAuditUserId, setAuditUser } from "./audit-context";

/** Mimics requireUser(): scope first (sync), userId only known after an await. */
async function fakeRequireUser(userId: number): Promise<number> {
  beginAuditScope();
  await new Promise((resolve) => setTimeout(resolve, 1));
  setAuditUser(userId);
  return userId;
}

describe("audit context", () => {
  it("makes the user set after an await inside the guard visible to the caller", async () => {
    // Regression: with enterWith() after the await, the caller saw null ("system").
    const seen = await (async () => {
      await fakeRequireUser(7);
      await Promise.resolve();
      return getAuditUserId();
    })();
    expect(seen).toBe(7);
  });

  it("keeps concurrent requests apart", async () => {
    const handler = async (userId: number) => {
      await fakeRequireUser(userId);
      await new Promise((resolve) => setTimeout(resolve, 5));
      return getAuditUserId();
    };
    expect(await Promise.all([handler(1), handler(2), handler(3)])).toEqual([1, 2, 3]);
  });

  it("shares the scope across separately loaded copies of this module", async () => {
    // Regression: Next.js loads this module once for instrumentation.ts and
    // again for the route handlers; the globalThis-cached Prisma client read
    // the other copy's storage, so every audit row ended up as "system".
    vi.resetModules();
    const otherCopy = await import("./audit-context");
    expect(otherCopy.getAuditUserId).not.toBe(getAuditUserId); // really a second module instance

    const seen = await (async () => {
      await fakeRequireUser(5); // writes via this copy
      return otherCopy.getAuditUserId(); // read via the other copy, like db.ts did
    })();
    expect(seen).toBe(5);
  });

  it("is null for code that never authenticates (background jobs)", async () => {
    const seen = await (async () => {
      beginAuditScope();
      return getAuditUserId();
    })();
    expect(seen).toBeNull();
  });
});
