import { describe, expect, it } from "vitest";
import {
  buildResourceWhere,
  resourceInputSchema,
  resourceListQuerySchema,
  resourceUpdateSchema,
} from "./resources";

describe("resourceInputSchema", () => {
  it("defaults to an active person", () => {
    expect(resourceInputSchema.parse({ name: "Jan", hourlyRate: "35" })).toEqual({
      name: "Jan",
      type: "PERSON",
      hourlyRate: 35,
      active: true,
    });
  });

  it("accepts a machine and rejects unknown types, empty names and negative rates", () => {
    expect(resourceInputSchema.parse({ name: "Minigraver", type: "MACHINE", hourlyRate: 50 }).type).toBe("MACHINE");
    expect(() => resourceInputSchema.parse({ name: "X", type: "VEHICLE", hourlyRate: 1 })).toThrow();
    expect(() => resourceInputSchema.parse({ name: " ", hourlyRate: 1 })).toThrow();
    expect(() => resourceInputSchema.parse({ name: "X", hourlyRate: -1 })).toThrow();
  });
});

describe("resourceUpdateSchema", () => {
  it("does not inject defaults, so a partial update leaves other fields alone", () => {
    expect(resourceUpdateSchema.parse({ active: false })).toEqual({ active: false });
  });
});

describe("resourceListQuerySchema + buildResourceWhere", () => {
  it("has no filters by default and ignores an empty type", () => {
    expect(buildResourceWhere(resourceListQuerySchema.parse({ type: "" }))).toEqual({});
  });

  it("filters on name, type and status", () => {
    const q = resourceListQuerySchema.parse({ name: "gra", type: "MACHINE", status: "active" });
    expect(buildResourceWhere(q)).toEqual({
      name: { contains: "gra", mode: "insensitive" },
      type: "MACHINE",
      active: true,
    });
    expect(buildResourceWhere(resourceListQuerySchema.parse({ status: "inactive" }))).toEqual({ active: false });
  });
});
