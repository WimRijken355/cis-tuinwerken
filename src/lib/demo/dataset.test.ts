import { describe, expect, it } from "vitest";
import {
  DEMO_CHECKLIST,
  DEMO_CUSTOMERS,
  DEMO_MACHINES,
  DEMO_PEOPLE,
  WORKDAY_HOURS,
} from "./dataset";

const todos = DEMO_CUSTOMERS.flatMap((c) => c.todos);
const recurring = DEMO_CUSTOMERS.flatMap((c) => c.recurring ?? []);
const work = [...todos, ...recurring];

describe("demo dataset", () => {
  it("has several different customers with unique names", () => {
    expect(DEMO_CUSTOMERS.length).toBeGreaterThanOrEqual(8);
    expect(new Set(DEMO_CUSTOMERS.map((c) => c.name)).size).toBe(DEMO_CUSTOMERS.length);
  });

  it("puts Cis on every todo and every recurring template", () => {
    for (const item of work) {
      expect(item.resources.Cis, item.title).toBeGreaterThan(0);
    }
  });

  it("puts Wim and Ken on some todos, but not on all", () => {
    for (const person of ["Wim", "Ken"] as const) {
      const withPerson = todos.filter((t) => t.resources[person]);
      expect(withPerson.length, person).toBeGreaterThan(0);
      expect(withPerson.length, person).toBeLessThan(todos.length);
    }
  });

  it("has todos of more than 2–3 working days, to test splitting over several days", () => {
    const multiDay = todos.filter((t) => t.estimatedHours > 3 * WORKDAY_HOURS);
    expect(multiDay.length).toBeGreaterThanOrEqual(3);
    expect(Math.max(...todos.map((t) => t.estimatedHours))).toBeGreaterThanOrEqual(5 * WORKDAY_HOURS);
    // ...and small jobs too.
    expect(todos.some((t) => t.estimatedHours <= 4)).toBe(true);
  });

  it("only references known resources and checklist tasks, with valid hours", () => {
    const resourceNames = new Set<string>([...DEMO_PEOPLE, ...DEMO_MACHINES.map((m) => m.name)]);
    const taskNames = new Set<string>(DEMO_CHECKLIST);
    for (const item of work) {
      expect(item.estimatedHours).toBeGreaterThan(0);
      expect(item.estimatedHours).toBeLessThan(999);
      for (const [name, hours] of Object.entries(item.resources)) {
        expect(resourceNames.has(name), name).toBe(true);
        expect(hours).toBeGreaterThan(0);
      }
      for (const task of item.tasks ?? []) expect(taskNames.has(task), task).toBe(true);
    }
  });

  it("uses machines on some todos", () => {
    expect(todos.some((t) => DEMO_MACHINES.some((m) => t.resources[m.name]))).toBe(true);
  });
});
