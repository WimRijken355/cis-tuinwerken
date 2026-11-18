import { describe, expect, it } from "vitest";
import { todoChangedQueryKeys } from "./query-keys";

describe("todoChangedQueryKeys", () => {
  it("refreshes blocks, todo lists and the edited todo (planning + Dagplanning)", () => {
    expect(todoChangedQueryKeys(42)).toEqual([["appointments"], ["todos"], ["todo", 42]]);
  });
});
