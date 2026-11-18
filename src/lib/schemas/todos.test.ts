import { describe, expect, it } from "vitest";
import { sumResourceHours, todoInputSchema, todoUpdateSchema, toTodoResourceDtos } from "./todos";

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
