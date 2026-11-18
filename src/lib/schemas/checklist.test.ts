import { describe, expect, it } from "vitest";
import {
  checklistItemIdsSchema,
  checklistItemInputSchema,
  checklistItemUpdateSchema,
  nextSortOrder,
  reorder,
} from "./checklist";

describe("checklist item schemas", () => {
  it("requires a name and defaults to active", () => {
    expect(checklistItemInputSchema.parse({ name: " Haag scheren " })).toEqual({
      name: "Haag scheren",
      active: true,
      sortOrder: 0,
    });
    expect(() => checklistItemInputSchema.parse({ name: "" })).toThrow();
  });

  it("partial update adds no defaults", () => {
    expect(checklistItemUpdateSchema.parse({ active: false })).toEqual({ active: false });
  });

  it("rejects the same task twice in a selection", () => {
    expect(checklistItemIdsSchema.parse([3, 1, 2])).toEqual([3, 1, 2]);
    expect(() => checklistItemIdsSchema.parse([1, 1])).toThrow("maar één keer");
  });
});

describe("nextSortOrder", () => {
  it("appends after the highest sort order", () => {
    expect(nextSortOrder([])).toBe(0);
    expect(nextSortOrder([{ sortOrder: 0 }, { sortOrder: 4 }])).toBe(5);
  });
});

describe("reorder", () => {
  const items = [
    { id: 10, sortOrder: 0 },
    { id: 11, sortOrder: 1 },
    { id: 12, sortOrder: 2 },
  ];

  it("swaps an item with its neighbour and only returns changed positions", () => {
    expect(reorder(items, 12, -1)).toEqual([
      { id: 12, sortOrder: 1 },
      { id: 11, sortOrder: 2 },
    ]);
    expect(reorder(items, 10, 1)).toEqual([
      { id: 11, sortOrder: 0 },
      { id: 10, sortOrder: 1 },
    ]);
  });

  it("does nothing at the edges or for an unknown id", () => {
    expect(reorder(items, 10, -1)).toEqual([]);
    expect(reorder(items, 12, 1)).toEqual([]);
    expect(reorder(items, 99, 1)).toEqual([]);
  });

  it("normalises duplicate/gapped sort orders", () => {
    const messy = [
      { id: 1, sortOrder: 5 },
      { id: 2, sortOrder: 5 },
      { id: 3, sortOrder: 9 },
    ];
    expect(reorder(messy, 3, -1)).toEqual([
      { id: 1, sortOrder: 0 },
      { id: 3, sortOrder: 1 },
      { id: 2, sortOrder: 2 },
    ]);
  });
});
