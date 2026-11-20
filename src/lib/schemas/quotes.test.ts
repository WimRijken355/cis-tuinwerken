import { describe, expect, it } from "vitest";
import { quoteLineIdsSchema } from "./quotes";
import { todoInputSchema, todoUpdateSchema } from "./todos";

describe("quote line ids on a todo", () => {
  it("defaults to none on create and is optional (keep as is) on update", () => {
    expect(todoInputSchema.parse({ customerId: 1, title: "Tuin", estimatedHours: 8 }).quoteLineIds).toEqual([]);
    expect(todoInputSchema.parse({ customerId: 1, title: "Tuin", estimatedHours: 8, quoteLineIds: [4, 5] }).quoteLineIds).toEqual([4, 5]);
    expect(todoUpdateSchema.parse({ title: "Tuin" }).quoteLineIds).toBeUndefined();
  });
  it("rejects duplicates and non-ids", () => {
    expect(() => quoteLineIdsSchema.parse([1, 1])).toThrow();
    expect(() => quoteLineIdsSchema.parse([0])).toThrow();
  });
});
