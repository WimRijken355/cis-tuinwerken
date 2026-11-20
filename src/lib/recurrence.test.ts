import { describe, expect, it } from "vitest";
import {
  describeRecurrence,
  dueOccurrences,
  inSeason,
  occurrencesUntil,
  recurrenceProblems,
  withWindows,
  type RecurrenceRule,
} from "./recurrence";

const weekly = (over: Partial<RecurrenceRule> = {}): RecurrenceRule => ({
  kind: "WEEKLY",
  interval: 1,
  weekdays: [2], // Tuesday
  startDate: "2027-03-01", // a Monday
  ...over,
});
const monthly = (over: Partial<RecurrenceRule> = {}): RecurrenceRule => ({
  kind: "MONTHLY",
  interval: 1,
  weekdays: [],
  monthlyMode: "DAY_OF_MONTH",
  monthDay: 15,
  startDate: "2027-01-01",
  ...over,
});

describe("occurrencesUntil — weekly", () => {
  it("every Tuesday from the start date", () => {
    expect(occurrencesUntil(weekly(), "2027-03-23")).toEqual(["2027-03-02", "2027-03-09", "2027-03-16", "2027-03-23"]);
  });
  it("every 2 weeks on Monday and Thursday, never before the start date", () => {
    // Starts on a Wednesday: that week's Monday is skipped, its Thursday counts.
    expect(occurrencesUntil(weekly({ interval: 2, weekdays: [4, 1], startDate: "2027-03-03" }), "2027-03-31")).toEqual([
      "2027-03-04",
      "2027-03-15",
      "2027-03-18",
      "2027-03-29",
    ]);
  });
  it("stops on the end date or after N times", () => {
    expect(occurrencesUntil(weekly({ endDate: "2027-03-10" }), "2027-12-31")).toEqual(["2027-03-02", "2027-03-09"]);
    expect(occurrencesUntil(weekly({ maxOccurrences: 3 }), "2027-12-31")).toHaveLength(3);
  });
  it("only within the season, every year (mowing April–October)", () => {
    const dates = occurrencesUntil(weekly({ startDate: "2027-01-01", seasonStartMonth: 4, seasonEndMonth: 10 }), "2028-05-01");
    expect(dates[0]).toBe("2027-04-06");
    expect(dates.filter((d) => d.startsWith("2027")).at(-1)).toBe("2027-10-26");
    expect(dates.some((d) => d >= "2027-11-01" && d < "2028-04-01")).toBe(false);
    expect(dates.filter((d) => d.startsWith("2028"))[0]).toBe("2028-04-04");
  });
  it("counts N times within the season only", () => {
    expect(occurrencesUntil(weekly({ startDate: "2027-01-01", seasonStartMonth: 4, seasonEndMonth: 10, maxOccurrences: 2 }), "2027-12-31")).toEqual([
      "2027-04-06",
      "2027-04-13",
    ]);
  });
});

describe("occurrencesUntil — monthly", () => {
  it("on day 31 clamps to the last day of shorter months", () => {
    expect(occurrencesUntil(monthly({ monthDay: 31 }), "2027-04-30")).toEqual(["2027-01-31", "2027-02-28", "2027-03-31", "2027-04-30"]);
  });
  it("every 2 months on day 15, from the start month", () => {
    expect(occurrencesUntil(monthly({ interval: 2, startDate: "2027-01-20" }), "2027-08-31")).toEqual([
      // 15 Jan is before the start date.
      "2027-03-15",
      "2027-05-15",
      "2027-07-15",
    ]);
  });
  it("the second Tuesday and the last Friday of the month", () => {
    expect(occurrencesUntil(monthly({ monthlyMode: "NTH_WEEKDAY", monthWeek: 2, monthWeekday: 2 }), "2027-03-31")).toEqual([
      "2027-01-12",
      "2027-02-09",
      "2027-03-09",
    ]);
    expect(occurrencesUntil(monthly({ monthlyMode: "NTH_WEEKDAY", monthWeek: 5, monthWeekday: 5 }), "2027-03-31")).toEqual([
      "2027-01-29",
      "2027-02-26",
      "2027-03-26",
    ]);
  });
});

describe("windows and due occurrences", () => {
  it("a todo's preferred window runs until the day before the next occurrence", () => {
    const rule = weekly({ weekdays: [1, 4] });
    expect(withWindows(rule, ["2027-03-01", "2027-03-04", "2027-03-08"])).toEqual([
      { date: "2027-03-01", windowStart: "2027-03-01", windowEnd: "2027-03-03" },
      { date: "2027-03-04", windowStart: "2027-03-04", windowEnd: "2027-03-07" },
      // Last one known: one interval (a week) at most.
      { date: "2027-03-08", windowStart: "2027-03-08", windowEnd: "2027-03-14" },
    ]);
  });
  it("the last mowing of the season does not get a window until next spring", () => {
    const rule = weekly({ startDate: "2027-01-01", seasonStartMonth: 4, seasonEndMonth: 10 });
    const windows = withWindows(rule, ["2027-10-26", "2028-04-04"]);
    expect(windows[0].windowEnd).toBe("2027-11-01");
  });
  it("due = visible lead time days ahead, until its window has passed", () => {
    // Today Wednesday 10 March, 7 days lead: Tue 9 (window until 15) and Tue 16 are due.
    expect(dueOccurrences(weekly(), "2027-03-10", 7).map((o) => o.date)).toEqual(["2027-03-09", "2027-03-16"]);
    // Nothing before the start date, nothing beyond the horizon.
    expect(dueOccurrences(weekly({ startDate: "2027-06-01" }), "2027-03-10", 7)).toEqual([]);
  });
  it("a start date long ago never floods the list with past occurrences", () => {
    expect(dueOccurrences(weekly({ startDate: "2020-01-01" }), "2027-03-10", 0).map((o) => o.date)).toEqual(["2027-03-09"]);
  });
});

describe("validation and description", () => {
  it("reports what is missing", () => {
    expect(recurrenceProblems({ kind: "PERIODS" })).toEqual([]);
    expect(recurrenceProblems({ kind: "WEEKLY", interval: 1, weekdays: [], startDate: "2027-01-01" })).toEqual([
      "Kies minstens één weekdag.",
    ]);
    expect(recurrenceProblems({ kind: "MONTHLY", interval: 1, monthlyMode: "NTH_WEEKDAY", startDate: "2027-01-01" })).toContain(
      "Kies welke weekdag van de maand.",
    );
    expect(recurrenceProblems({ ...weekly(), endDate: "2026-01-01" })).toContain("De einddatum ligt vóór de begindatum.");
    expect(recurrenceProblems({ ...weekly(), seasonStartMonth: 4 })).toContain(
      "Kies zowel het begin als het einde van het seizoen.",
    );
  });
  it("describes the rule in Dutch", () => {
    expect(describeRecurrence(weekly({ interval: 2, weekdays: [5, 2], seasonStartMonth: 4, seasonEndMonth: 10 }))).toBe(
      "Om de 2 weken op di en vr · apr–okt · vanaf 1/3/2027",
    );
    expect(describeRecurrence(monthly({ monthlyMode: "NTH_WEEKDAY", monthWeek: 5, monthWeekday: 5, maxOccurrences: 6 }))).toBe(
      "Elke maand op de laatste vrijdag · vanaf 1/1/2027 · 6 keer",
    );
    expect(describeRecurrence(monthly({ endDate: "2027-12-31" }))).toBe("Elke maand op dag 15 · vanaf 1/1/2027 · tot 31/12/2027");
  });
  it("inSeason handles a season over the year end", () => {
    expect(inSeason(12, 11, 2)).toBe(true);
    expect(inSeason(3, 11, 2)).toBe(false);
    expect(inSeason(3, null, null)).toBe(true);
  });
});
