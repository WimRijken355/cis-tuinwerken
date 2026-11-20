import { describe, expect, it } from "vitest";
import { Prisma } from "@/generated/prisma/client";
import { todoInputSchema, todoUpdateSchema } from "./todos";

/**
 * The todo routes spread the parsed body into `db.todo.create/update`
 * (POST/PATCH /api/todos). Every field the schema lets through must therefore
 * exist as a column in the *generated* Prisma client — otherwise the request
 * fails at runtime with "Unknown argument ..." (a 500 "Er ging iets mis op de
 * server"). This catches a field added to the Zod schema without a matching
 * prisma/schema.prisma change + `prisma generate`.
 *
 * Note: a dev server that was already running during `prisma generate` keeps
 * the old schema in memory until it is restarted — no test can catch that.
 */

/** Body fields the routes handle themselves instead of passing them to Prisma. */
const ROUTE_HANDLED = new Set(["resources", "taskIds", "quoteLineIds", "preferredFrom", "preferredTo"]);
const todoColumns = new Set(Object.keys(Prisma.TodoScalarFieldEnum));

function unknownColumns(fields: string[]): string[] {
  return fields.filter((f) => !ROUTE_HANDLED.has(f) && !todoColumns.has(f));
}

describe("todo schemas match the generated Prisma Todo model", () => {
  it("every create field exists as a Todo column", () => {
    expect(unknownColumns(Object.keys(todoInputSchema.shape))).toEqual([]);
  });

  it("every update field exists as a Todo column", () => {
    expect(unknownColumns(Object.keys(todoUpdateSchema.shape))).toEqual([]);
  });

  it("includes the project flag", () => {
    expect(todoColumns.has("isProject")).toBe(true);
    expect(Object.keys(todoInputSchema.shape)).toContain("isProject");
  });

  it("would flag a schema field without a column", () => {
    expect(unknownColumns(["title", "notAColumn"])).toEqual(["notAColumn"]);
  });
});
