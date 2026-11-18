import { describe, expect, it } from "vitest";
import { reorder } from "../sortable";
import { looseTodoPresetInputSchema, looseTodoPresetUpdateSchema } from "./loose-todo-presets";

describe("loose todo presets", () => {
  it("require a name and default to active", () => {
    expect(looseTodoPresetInputSchema.parse({ name: " Vakantie " })).toEqual({ name: "Vakantie", active: true });
    expect(() => looseTodoPresetInputSchema.parse({ name: "" })).toThrow();
  });

  it("partial update adds no defaults", () => {
    expect(looseTodoPresetUpdateSchema.parse({ active: false })).toEqual({ active: false });
  });

  it("share the generic up/down reordering", () => {
    expect(
      reorder(
        [
          { id: 1, sortOrder: 0 },
          { id: 2, sortOrder: 1 },
        ],
        2,
        -1,
      ),
    ).toEqual([
      { id: 2, sortOrder: 0 },
      { id: 1, sortOrder: 1 },
    ]);
  });
});
