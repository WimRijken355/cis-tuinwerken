import { describe, expect, it } from "vitest";
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

  it("is null for code that never authenticates (background jobs)", async () => {
    const seen = await (async () => {
      beginAuditScope();
      return getAuditUserId();
    })();
    expect(seen).toBeNull();
  });
});
