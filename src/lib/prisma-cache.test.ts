import { describe, expect, it } from "vitest";
import { Prisma } from "@/generated/prisma/client";
import { canReuseCachedClient, schemaFingerprint } from "./prisma-cache";

describe("schemaFingerprint", () => {
  const before = {
    TodoScalarFieldEnum: { id: "id", customerId: "customerId", title: "title" },
    CustomerScalarFieldEnum: { id: "id", name: "name" },
    SortOrder: { asc: "asc", desc: "desc" },
  };

  it("changes when a field is added to a model (the stale-client case)", () => {
    const after = {
      ...before,
      TodoScalarFieldEnum: { ...before.TodoScalarFieldEnum, isProject: "isProject" },
    };
    expect(schemaFingerprint(after)).not.toBe(schemaFingerprint(before));
  });

  it("is stable regardless of key order and ignores non-model enums", () => {
    const reordered = {
      SortOrder: { desc: "desc", asc: "asc" },
      CustomerScalarFieldEnum: { name: "name", id: "id" },
      TodoScalarFieldEnum: { title: "title", id: "id", customerId: "customerId" },
    };
    expect(schemaFingerprint(reordered)).toBe(schemaFingerprint(before));
    expect(schemaFingerprint(before)).toBe("Customer(id,name);Todo(customerId,id,title)");
  });

  it("covers the real generated client, including recently added fields", () => {
    const fp = schemaFingerprint(Prisma as unknown as Record<string, unknown>);
    expect(fp).toMatch(/(^|;)Todo\([^)]*\bisProject\b/);
    expect(fp).toMatch(/(^|;)Customer\(/);
  });
});

describe("canReuseCachedClient", () => {
  const client = { name: "client" };

  it("reuses the cached client only when the schema did not change", () => {
    expect(canReuseCachedClient({ client, fingerprint: "a" }, "a")).toBe(true);
    expect(canReuseCachedClient({ client, fingerprint: "a" }, "b")).toBe(false);
    expect(canReuseCachedClient(undefined, "a")).toBe(false);
  });
});
