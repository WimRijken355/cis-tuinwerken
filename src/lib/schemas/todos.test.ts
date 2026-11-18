import { describe, expect, it } from "vitest";
import {
  planTodoTaskSync,
  sumResourceHours,
  todoInputSchema,
  todoUpdateSchema,
  toTodoResourceDtos,
  toTodoTaskDtos,
} from "./todos";

describe("todoInputSchema", () => {
  it("defaults to no resources", () => {
    const todo = todoInputSchema.parse({ customerId: 1, title: "Haag scheren", estimatedHours: "3" });
    expect(todo.resources).toEqual([]);
    expect(todo.estimatedHours).toBe(3);
  });

  it("accepts resources whose hours differ from the total", () => {
    const todo = todoInputSchema.parse({
      customerId: 1,
      title: "Gazon aanleggen",
      estimatedHours: 8,
      resources: [
        { resourceId: 1, hours: 8 },
        { resourceId: 2, hours: "8" },
        { resourceId: 3, hours: 2.555 },
      ],
    });
    expect(todo.resources).toEqual([
      { resourceId: 1, hours: 8 },
      { resourceId: 2, hours: 8 },
      { resourceId: 3, hours: 2.56 },
    ]);
  });

  it("rejects a resource listed twice or with zero hours", () => {
    const base = { customerId: 1, title: "X", estimatedHours: 1 };
    expect(() =>
      todoInputSchema.parse({ ...base, resources: [{ resourceId: 1, hours: 1 }, { resourceId: 1, hours: 2 }] }),
    ).toThrow("maar één keer");
    expect(() => todoInputSchema.parse({ ...base, resources: [{ resourceId: 1, hours: 0 }] })).toThrow();
  });
});

describe("todoUpdateSchema", () => {
  it("leaves resources untouched when omitted, and allows clearing them", () => {
    expect(todoUpdateSchema.parse({ status: "CANCELLED" }).resources).toBeUndefined();
    expect(todoUpdateSchema.parse({ resources: [] }).resources).toEqual([]);
  });
});

describe("resource helpers", () => {
  it("maps rows to DTOs and sums hours", () => {
    const dtos = toTodoResourceDtos([
      { resourceId: 1, hours: "4.50", resource: { name: "Jan", type: "PERSON" } },
      { resourceId: 2, hours: 2, resource: { name: "Minigraver", type: "MACHINE" } },
    ]);
    expect(dtos).toEqual([
      { resourceId: 1, name: "Jan", type: "PERSON", hours: 4.5 },
      { resourceId: 2, name: "Minigraver", type: "MACHINE", hours: 2 },
    ]);
    expect(sumResourceHours(dtos)).toBe(6.5);
    expect(sumResourceHours([])).toBe(0);
  });
});

describe("todo checklist", () => {
  it("defaults to no tasks and rejects duplicates", () => {
    const base = { customerId: 1, title: "X", estimatedHours: 1 };
    expect(todoInputSchema.parse(base).taskIds).toEqual([]);
    expect(() => todoInputSchema.parse({ ...base, taskIds: [4, 4] })).toThrow();
    expect(todoUpdateSchema.parse({}).taskIds).toBeUndefined();
  });

  it("keeps ticked tasks, deletes removed ones, creates new ones and reorders", () => {
    const existing = [
      { id: 100, checklistItemId: 1, sortOrder: 0 }, // stays, moves to position 1
      { id: 101, checklistItemId: 2, sortOrder: 1 }, // removed
      { id: 102, checklistItemId: 3, sortOrder: 2 }, // stays, moves to position 0
    ];
    const names = new Map([[4, "Gras maaien"]]);
    expect(planTodoTaskSync(existing, [3, 1, 4], names)).toEqual({
      deleteIds: [101],
      create: [{ checklistItemId: 4, label: "Gras maaien", sortOrder: 2 }],
      updateSortOrder: [
        { id: 102, sortOrder: 0 },
        { id: 100, sortOrder: 1 },
      ],
    });
  });

  it("clears the checklist with an empty selection", () => {
    const plan = planTodoTaskSync([{ id: 1, checklistItemId: 9, sortOrder: 0 }], [], new Map());
    expect(plan).toEqual({ deleteIds: [1], create: [], updateSortOrder: [] });
  });

  it("maps task rows to DTOs", () => {
    expect(
      toTodoTaskDtos([{ id: 1, checklistItemId: 2, label: "Haag scheren", done: true, sortOrder: 0 } as never]),
    ).toEqual([{ id: 1, checklistItemId: 2, label: "Haag scheren", done: true }]);
  });
});
