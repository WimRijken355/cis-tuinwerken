import { describe, expect, it } from "vitest";
import {
  applyPlanningFlags,
  blockEmphasis,
  dayKey,
  dayLoad,
  minutesPerDay,
  toggleFocus,
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
  needsPlanning,
  partLabel,
  partNumbers,
  roundToQuarter,
  joinDuration,
  splitDuration,
  splitOverWorkdays,
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

  it("filters on one or more cities (OR), including 'Zonder plaats' for losse todo's", () => {
    expect(matchesPlanningFilter(item, f({ cities: ["Mol"] }))).toBe(true);
    expect(matchesPlanningFilter(item, f({ cities: ["Geel"] }))).toBe(false);
    expect(matchesPlanningFilter(item, f({ cities: ["Geel", "Mol"] }))).toBe(true);
    const loose = { title: "Vakantie", customerName: "", city: null, resourceIds: [2] };
    expect(matchesPlanningFilter(loose, f({ cities: [NO_CITY_LABEL] }))).toBe(true);
  });

  it("filters on one or more resources (OR), e.g. minigraver or aanhangwagen", () => {
    expect(matchesPlanningFilter(item, f({ resourceIds: [5] }))).toBe(true);
    expect(matchesPlanningFilter(item, f({ resourceIds: [9] }))).toBe(false);
    expect(matchesPlanningFilter(item, f({ resourceIds: [9, 5] }))).toBe(true);
  });

  it("combines the different filters (AND)", () => {
    expect(matchesPlanningFilter(item, f({ text: "vijver", cities: ["Mol"], resourceIds: [5] }))).toBe(true);
    expect(matchesPlanningFilter(item, f({ text: "vijver", cities: ["Mol"], resourceIds: [9] }))).toBe(false);
    expect(matchesPlanningFilter(item, f({ text: "vijver", cities: ["Geel"], resourceIds: [5] }))).toBe(false);
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

describe("focus on one todo (sidebar ↔ grid)", () => {
  it("toggles: same todo clears, another takes over", () => {
    expect(toggleFocus(null, 4)).toBe(4);
    expect(toggleFocus(4, 4)).toBeNull();
    expect(toggleFocus(4, 9)).toBe(9);
  });

  it("highlights the focused todo's blocks and fades the rest", () => {
    expect(blockEmphasis({ todoId: 4, focusTodoId: 4, matchesFilter: false })).toEqual({ highlighted: true, opacity: 1 });
    expect(blockEmphasis({ todoId: 5, focusTodoId: 4, matchesFilter: true })).toEqual({ highlighted: false, opacity: 0.55 });
    expect(blockEmphasis({ todoId: 5, focusTodoId: 4, matchesFilter: false })).toEqual({ highlighted: false, opacity: 0.25 });
    expect(blockEmphasis({ todoId: 5, focusTodoId: null, matchesFilter: true })).toEqual({ highlighted: false, opacity: 1 });
  });
});

describe("quarter-hour durations", () => {
  it("rounds a remaining time to whole quarters", () => {
    expect(roundToQuarter(100)).toBe(105);
    expect(roundToQuarter(5)).toBe(15);
    expect(roundToQuarter(480)).toBe(480);
  });
});

describe("duration as hours + quarter minutes", () => {
  it("splits a duration into hours and minutes", () => {
    expect(splitDuration(150)).toEqual({ hours: 2, minutes: 30 });
    expect(splitDuration(480)).toEqual({ hours: 8, minutes: 0 });
    expect(splitDuration(100)).toEqual({ hours: 1, minutes: 45 }); // rounded to a quarter
  });

  it("joins hours + minutes (also more than a working day), at least one quarter", () => {
    expect(joinDuration(2, 30)).toBe(150);
    expect(joinDuration(0, 0)).toBe(15);
    expect(joinDuration(20, 30)).toBe(1230);
    expect(joinDuration(Number.NaN, 15)).toBe(15);
  });

  it("splits more than a working day over consecutive weekdays (same start time)", () => {
    // Thursday 19 Nov 2026, 08:00 Brussels (UTC+1), 20 h → Thu 8 h, Fri 8 h, Mon 4 h.
    expect(splitOverWorkdays("2026-11-19", "08:00", 20 * 60)).toEqual([
      { startAt: "2026-11-19T07:00:00.000Z", durationMinutes: 480 },
      { startAt: "2026-11-20T07:00:00.000Z", durationMinutes: 480 },
      { startAt: "2026-11-23T07:00:00.000Z", durationMinutes: 240 },
    ]);
    expect(splitOverWorkdays("2026-11-19", "08:00", 90)).toEqual([
      { startAt: "2026-11-19T07:00:00.000Z", durationMinutes: 90 },
    ]);
  });

  it("never lets a day run past midnight", () => {
    const blocks = splitOverWorkdays("2026-11-19", "20:00", 10 * 60);
    // Every day starts at 20:00 and stops at midnight: 4 h + 4 h + 2 h.
    expect(blocks.map((b) => b.durationMinutes)).toEqual([240, 240, 120]);
  });
});

describe("month view load per day", () => {
  it("sums planned minutes per Brussels day, ignoring cancelled blocks", () => {
    const perDay = minutesPerDay([
      { startAt: "2026-11-19T07:00:00Z", durationMinutes: 480, status: "PLANNED" },
      { startAt: "2026-11-20T07:00:00Z", durationMinutes: 120, status: "PLANNED" },
      { startAt: "2026-11-20T13:00:00Z", durationMinutes: 60, status: "DONE" },
      { startAt: "2026-11-20T15:00:00Z", durationMinutes: 999, status: "CANCELLED" },
      // 23:30 UTC on the 21st is already the 22nd in Brussels.
      { startAt: "2026-11-21T23:30:00Z", durationMinutes: 30, status: "PLANNED" },
    ]);
    expect(Object.fromEntries(perDay)).toEqual({ "2026-11-19": 480, "2026-11-20": 180, "2026-11-22": 30 });
  });

  it("classifies a day as free, partial or full", () => {
    expect(dayLoad(0)).toBe("free");
    expect(dayLoad(180)).toBe("partial");
    expect(dayLoad(480)).toBe("full");
    expect(dayLoad(600)).toBe("full");
  });
});

describe("dayKey", () => {
  it("uses the Brussels calendar day, not the UTC one", () => {
    // Brussels midnight of 20 Nov 2026 = 19 Nov 23:00 UTC.
    expect(dayKey(new Date("2026-11-19T23:00:00Z"))).toBe("2026-11-20");
    expect(new Date("2026-11-19T23:00:00Z").toISOString().slice(0, 10)).toBe("2026-11-19"); // the trap
    // Summer time (UTC+2).
    expect(dayKey(new Date("2026-07-14T22:00:00Z"))).toBe("2026-07-15");
  });
});

describe("needsPlanning (in te plannen list)", () => {
  it("lists todos with time left, and jobs registered without invoice and nothing planned", () => {
    expect(needsPlanning({ remainingMinutes: 120, plannedBlocks: 1, doneBlocks: 0 })).toBe(true);
    expect(needsPlanning({ remainingMinutes: 0, plannedBlocks: 1, doneBlocks: 1 })).toBe(false); // next day planned
    expect(needsPlanning({ remainingMinutes: 0, plannedBlocks: 0, doneBlocks: 1 })).toBe(true); // follow-up needed
    expect(needsPlanning({ remainingMinutes: 0, plannedBlocks: 0, doneBlocks: 0 })).toBe(false);
  });

  it("proposes a working day when dropping a follow-up with no time left", () => {
    expect(dropDurationMinutes(0, at("08:00"))).toBe(WORKDAY_MINUTES);
  });
});
