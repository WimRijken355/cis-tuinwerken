import { describe, expect, it } from "vitest";
import {
  DEFAULT_TODO_FILTER,
  filterTodos,
  isTodoFilterActive,
  matchesTodoFilter,
  matchesTodoState,
  todoStatusActions,
  type TodoListFilter,
} from "./todo-list";

const todo = (over: Partial<Parameters<typeof matchesTodoFilter>[0]> = {}) => ({
  title: "Haag snoeien",
  status: "OPEN" as const,
  customerId: 1 as number | null,
  customerName: "Janssens",
  customerCity: "Gent",
  description: "Achterkant ook",
  resources: [{ resourceId: 3, name: "Cis", type: "PERSON" as const, hours: 4 }],
  ...over,
});

const f = (over: Partial<TodoListFilter> = {}): TodoListFilter => ({ ...DEFAULT_TODO_FILTER, ...over });

describe("matchesTodoState", () => {
  it("ACTIVE = in te plannen + ingepland, CLOSED = klaar + geannuleerd", () => {
    expect(matchesTodoState("OPEN", "ACTIVE")).toBe(true);
    expect(matchesTodoState("PLANNED", "ACTIVE")).toBe(true);
    expect(matchesTodoState("DONE", "ACTIVE")).toBe(false);
    expect(matchesTodoState("DONE", "CLOSED")).toBe(true);
    expect(matchesTodoState("CANCELLED", "CLOSED")).toBe(true);
    expect(matchesTodoState("PLANNED", "CLOSED")).toBe(false);
  });
  it("a single status or all", () => {
    expect(matchesTodoState("PLANNED", "PLANNED")).toBe(true);
    expect(matchesTodoState("OPEN", "PLANNED")).toBe(false);
    expect(matchesTodoState("CANCELLED", "")).toBe(true);
  });
});

describe("matchesTodoFilter", () => {
  it("default shows open work only", () => {
    expect(matchesTodoFilter(todo(), DEFAULT_TODO_FILTER)).toBe(true);
    expect(matchesTodoFilter(todo({ status: "DONE" }), DEFAULT_TODO_FILTER)).toBe(false);
  });
  it("text matches title, customer, city and description, case-insensitive", () => {
    expect(matchesTodoFilter(todo(), f({ text: "HAAG" }))).toBe(true);
    expect(matchesTodoFilter(todo(), f({ text: "janss" }))).toBe(true);
    expect(matchesTodoFilter(todo(), f({ text: "gent" }))).toBe(true);
    expect(matchesTodoFilter(todo(), f({ text: "achterkant" }))).toBe(true);
    expect(matchesTodoFilter(todo(), f({ text: "gazon" }))).toBe(false);
  });
  it("kind separates customer todos from losse todo's", () => {
    const loose = todo({ customerId: null, customerName: "Vakantie" });
    expect(matchesTodoFilter(loose, f({ kind: "loose" }))).toBe(true);
    expect(matchesTodoFilter(loose, f({ kind: "customer" }))).toBe(false);
    expect(matchesTodoFilter(todo(), f({ kind: "loose" }))).toBe(false);
  });
  it("resource filter needs that resource on the todo", () => {
    expect(matchesTodoFilter(todo(), f({ resourceId: 3 }))).toBe(true);
    expect(matchesTodoFilter(todo(), f({ resourceId: 4 }))).toBe(false);
    expect(matchesTodoFilter(todo({ resources: undefined }), f({ resourceId: 3 }))).toBe(false);
  });
  it("filterTodos keeps the order", () => {
    const list = [todo({ title: "a" }), todo({ title: "b", status: "DONE" }), todo({ title: "c" })];
    expect(filterTodos(list, DEFAULT_TODO_FILTER).map((t) => t.title)).toEqual(["a", "c"]);
  });
});

describe("isTodoFilterActive", () => {
  it("is false for the default and true once something differs", () => {
    expect(isTodoFilterActive(DEFAULT_TODO_FILTER)).toBe(false);
    expect(isTodoFilterActive(f({ text: "  " }))).toBe(false);
    expect(isTodoFilterActive(f({ state: "" }))).toBe(true);
    expect(isTodoFilterActive(f({ kind: "loose" }))).toBe(true);
    expect(isTodoFilterActive(f({ resourceId: 1 }))).toBe(true);
  });
});

describe("todoStatusActions", () => {
  it("a fresh todo can be deleted or cancelled", () => {
    expect(todoStatusActions("OPEN", [])).toEqual({ canDelete: true, canCancel: true, canReopen: false });
  });
  it("with blocks it can no longer be deleted; planned work cannot be cancelled", () => {
    expect(todoStatusActions("PLANNED", [{ status: "PLANNED" }])).toEqual({
      canDelete: false,
      canCancel: false,
      canReopen: false,
    });
  });
  it("registered work is never cancelled (it still has to be invoiced)", () => {
    expect(todoStatusActions("OPEN", [{ status: "DONE" }]).canCancel).toBe(false);
  });
  it("only cancelled blocks: cancel allowed, delete not", () => {
    expect(todoStatusActions("OPEN", [{ status: "CANCELLED" }])).toEqual({
      canDelete: false,
      canCancel: true,
      canReopen: false,
    });
  });
  it("a cancelled todo can be reopened", () => {
    expect(todoStatusActions("CANCELLED", []).canReopen).toBe(true);
    expect(todoStatusActions("DONE", []).canReopen).toBe(false);
  });
});
