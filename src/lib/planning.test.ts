import { describe, expect, it } from "vitest";
import {
  applyPlanningFlags,
  EMPTY_PLANNING_FILTER,
  groupByCity,
  isFilterActive,
  matchesPlanningFilter,
  NO_CITY_LABEL,
  type PlanningFilter,
  dropDurationMinutes,
  formatMinutesAsHours,
  LOOSE_TODO_COLOR,
  minutesUntilMidnight,
  partLabel,
  partNumbers,
  plannedMinutes,
  remainingMinutes,
  todoColor,
  WORKDAY_MINUTES,
} from "./planning";
import { appointmentInputSchema, appointmentUpdateSchema } from "./schemas/appointments";
import { todoInputSchema } from "./schemas/todos";

// 18 Nov 2026 is winter time in Brussels (UTC+1).
const at = (localTime: string) => new Date(`2026-11-18T${localTime}:00+01:00`);

describe("remaining time", () => {
  it("is the estimate minus the planned (non-cancelled) blocks, never negative", () => {
    const blocks = [
      { durationMinutes: 480, status: "PLANNED" as const },
      { durationMinutes: 240, status: "DONE" as const },
      { durationMinutes: 999, status: "CANCELLED" as const },
    ];
    expect(plannedMinutes(blocks)).toBe(720);
    expect(remainingMinutes(40, 720)).toBe(40 * 60 - 720);
    expect(remainingMinutes(2, 720)).toBe(0);
  });

  it("goes up again when a block is shortened (it is derived, not stored)", () => {
    const before = remainingMinutes(16, plannedMinutes([{ durationMinutes: 480, status: "PLANNED" }]));
    const after = remainingMinutes(16, plannedMinutes([{ durationMinutes: 300, status: "PLANNED" }]));
    expect(after - before).toBe(180);
  });
});

describe("dropDurationMinutes (splitting a todo when it is dropped)", () => {
  it("plans at most one working day; the rest stays to be planned", () => {
    expect(dropDurationMinutes(40 * 60, at("08:00"))).toBe(WORKDAY_MINUTES);
    expect(dropDurationMinutes(150, at("08:00"))).toBe(150);
  });

  it("never runs past midnight", () => {
    expect(minutesUntilMidnight(at("20:00"))).toBe(240);
    expect(dropDurationMinutes(40 * 60, at("20:00"))).toBe(240);
    expect(dropDurationMinutes(40 * 60, at("23:50"))).toBe(15); // at least one slot
  });

  it("rounds down to whole 15-minute slots", () => {
    expect(dropDurationMinutes(100, at("08:00"))).toBe(90);
  });
});

describe("partNumbers (1/3, 2/3, ...)", () => {
  it("numbers blocks chronologically and counts the days still needed", () => {
    const blocks = [
      { id: 7, startAt: "2026-11-20T07:00:00Z" },
      { id: 3, startAt: "2026-11-18T07:00:00Z" },
    ];
    const parts = partNumbers(blocks, 16 * 60); // two more working days to plan
    expect(parts.get(3)).toEqual({ index: 1, total: 4 });
    expect(parts.get(7)).toEqual({ index: 2, total: 4 });
    expect(partNumbers(blocks, 0).get(7)).toEqual({ index: 2, total: 2 });
  });

  it("hides the label for a todo in a single block", () => {
    expect(partLabel({ index: 1, total: 1 })).toBe("");
    expect(partLabel({ index: 2, total: 3 })).toBe("2/3");
  });
});

describe("bevestigd / reservatie", () => {
  const none = { confirmed: false, reservation: false };
  it("are mutually exclusive", () => {
    expect(applyPlanningFlags(none, { confirmed: true })).toEqual({ confirmed: true, reservation: false });
    expect(applyPlanningFlags({ confirmed: true, reservation: false }, { reservation: true })).toEqual({
      confirmed: false,
      reservation: true,
    });
    expect(applyPlanningFlags({ confirmed: false, reservation: true }, { reservation: false })).toEqual(none);
  });

  it("are accepted by the appointment contracts", () => {
    expect(appointmentUpdateSchema.parse({ confirmed: true })).toEqual({ confirmed: true });
    // A drop on the grid sends no duration: the server decides.
    expect(appointmentInputSchema.parse({ todoId: 1, startAt: "2026-11-18T08:00:00Z" }).durationMinutes).toBeUndefined();
  });
});

describe("colours and loose todos", () => {
  it("gives every todo a stable colour; losse todo's are grey", () => {
    expect(todoColor(12)).toBe(todoColor(12));
    expect(todoColor(1)).not.toBe(todoColor(2));
    expect(todoColor(5, true)).toBe(LOOSE_TODO_COLOR);
  });

  it("allows a todo without customer (losse todo)", () => {
    expect(todoInputSchema.parse({ title: "Vakantie", estimatedHours: 8 }).customerId).toBeNull();
    expect(todoInputSchema.parse({ customerId: 4, title: "X", estimatedHours: 1 }).customerId).toBe(4);
  });

  it("formats hours the Belgian way", () => {
    expect(formatMinutesAsHours(150)).toBe("2,5 u");
    expect(formatMinutesAsHours(480)).toBe("8 u");
  });
});

describe("planning sidebar filter", () => {
  const item = {
    title: "Vijver graven en aanleggen",
    customerName: "Mertens Luc",
    city: "Mol",
    resourceIds: [1, 5],
  };
  const f = (patch: Partial<PlanningFilter>): PlanningFilter => ({ ...EMPTY_PLANNING_FILTER, ...patch });

  it("matches everything without filter", () => {
    expect(isFilterActive(EMPTY_PLANNING_FILTER)).toBe(false);
    expect(matchesPlanningFilter(item, EMPTY_PLANNING_FILTER)).toBe(true);
  });

  it("free text searches title, customer and city (case/accent-insensitive, all words)", () => {
    expect(matchesPlanningFilter(item, f({ text: "vijver" }))).toBe(true);
    expect(matchesPlanningFilter(item, f({ text: "MERTENS" }))).toBe(true);
    expect(matchesPlanningFilter(item, f({ text: "mol vijver" }))).toBe(true);
    expect(matchesPlanningFilter(item, f({ text: "mol haag" }))).toBe(false);
    expect(matchesPlanningFilter({ ...item, title: "Béton gieten" }, f({ text: "beton" }))).toBe(true);
  });

  it("filters on exact city, including 'Zonder plaats' for losse todo's", () => {
    expect(matchesPlanningFilter(item, f({ city: "Mol" }))).toBe(true);
    expect(matchesPlanningFilter(item, f({ city: "Geel" }))).toBe(false);
    const loose = { title: "Vakantie", customerName: "", city: null, resourceIds: [2] };
    expect(matchesPlanningFilter(loose, f({ city: NO_CITY_LABEL }))).toBe(true);
  });

  it("filters on a resource, e.g. the minigraver", () => {
    expect(matchesPlanningFilter(item, f({ resourceId: 5 }))).toBe(true);
    expect(matchesPlanningFilter(item, f({ resourceId: 9 }))).toBe(false);
  });

  it("combines all filters (AND)", () => {
    expect(matchesPlanningFilter(item, f({ text: "vijver", city: "Mol", resourceId: 5 }))).toBe(true);
    expect(matchesPlanningFilter(item, f({ text: "vijver", city: "Mol", resourceId: 9 }))).toBe(false);
  });
});

describe("groupByCity", () => {
  it("groups alphabetically with 'Zonder plaats' last", () => {
    const groups = groupByCity(
      [
        { id: 1, city: "Westerlo" },
        { id: 2, city: null },
        { id: 3, city: "Geel" },
        { id: 4, city: "Westerlo" },
        { id: 5, city: " " },
      ],
      (x) => x.city,
    );
    expect(groups.map((g) => [g.city, g.items.map((i) => i.id)])).toEqual([
      ["Geel", [3]],
      ["Westerlo", [1, 4]],
      [NO_CITY_LABEL, [2, 5]],
    ]);
  });
});
