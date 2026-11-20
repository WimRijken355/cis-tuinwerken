import { describe, expect, it } from "vitest";
import {
  CUSTOMER_TABS,
  customerTabCounts,
  DEFAULT_HISTORY_FILTER,
  filterCustomerHistory,
  parseCustomerTab,
} from "./customer-tabs";

describe("parseCustomerTab", () => {
  it("opens the requested tab, falling back to the details", () => {
    expect(CUSTOMER_TABS).toEqual(["details", "recurring", "new-todo", "history"]);
    expect(parseCustomerTab("history")).toBe("history");
    expect(parseCustomerTab("new-todo")).toBe("new-todo");
    expect(parseCustomerTab("bogus")).toBe("details");
    expect(parseCustomerTab(null)).toBe("details");
  });
});

describe("customerTabCounts (record counts on the tab headers)", () => {
  it("counts recurring templates, open and all todos, and quotes when linked to EF", () => {
    const counts = customerTabCounts({
      todos: [{ status: "OPEN" }, { status: "PLANNED" }, { status: "DONE" }, { status: "CANCELLED" }],
      recurringTemplates: [{}, {}],
      quotes: 3,
    });
    expect(counts).toEqual({ quotes: 3, recurring: 2, openTodos: 2, allTodos: 4 });
  });
  it("shows no quote count for a customer that is not linked to EF, and zeros when empty", () => {
    expect(customerTabCounts({ todos: [], recurringTemplates: [] })).toEqual({
      quotes: null,
      recurring: 0,
      openTodos: 0,
      allTodos: 0,
    });
  });
});

describe("filterCustomerHistory", () => {
  const todos = [
    { title: "Haag scheren", status: "DONE" as const, completedAt: "2026-06-01T10:00:00Z", createdAt: "2026-05-01T00:00:00Z" },
    { title: "Gazon maaien", status: "OPEN" as const, completedAt: null, createdAt: "2026-11-01T00:00:00Z", description: "achtertuin" },
    { title: "Snoeien", status: "CANCELLED" as const, completedAt: "2026-09-01T10:00:00Z", createdAt: "2026-08-01T00:00:00Z" },
    { title: "Bladeren ruimen", status: "PLANNED" as const, completedAt: null, createdAt: "2026-11-10T00:00:00Z" },
  ];
  const titles = (list: { title: string }[]) => list.map((t) => t.title);

  it("shows everything by default: open work first, then most recent first", () => {
    expect(titles(filterCustomerHistory(todos, DEFAULT_HISTORY_FILTER))).toEqual([
      "Bladeren ruimen",
      "Gazon maaien",
      "Snoeien",
      "Haag scheren",
    ]);
  });
  it("filters on state and on text in title or description", () => {
    expect(titles(filterCustomerHistory(todos, { text: "", state: "CLOSED" }))).toEqual(["Snoeien", "Haag scheren"]);
    expect(titles(filterCustomerHistory(todos, { text: "", state: "ACTIVE" }))).toEqual(["Bladeren ruimen", "Gazon maaien"]);
    expect(titles(filterCustomerHistory(todos, { text: "ACHTERTUIN", state: "" }))).toEqual(["Gazon maaien"]);
    expect(filterCustomerHistory(todos, { text: "haag", state: "ACTIVE" })).toEqual([]);
  });
});
