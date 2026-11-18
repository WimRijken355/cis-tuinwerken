import { describe, expect, it } from "vitest";
import {
  allocatePlannedHours,
  bucketHours,
  niceTicks,
  OVERFLOW_COLOR,
  periodBuckets,
  periodRange,
  resourceColor,
  SERIES_COLORS,
  shiftPeriod,
  totalsPerResource,
} from "./dashboard";

describe("periods", () => {
  it("a week runs monday–sunday and has 7 day buckets", () => {
    expect(periodRange("week", "2026-11-18")).toMatchObject({ from: "2026-11-16", to: "2026-11-22" });
    const buckets = periodBuckets("week", "2026-11-18");
    expect(buckets).toHaveLength(7);
    expect(buckets[0]).toMatchObject({ from: "2026-11-16", to: "2026-11-16" });
  });

  it("a month is split in the weeks that overlap it, clipped to the month", () => {
    const buckets = periodBuckets("month", "2026-11-18");
    expect(buckets[0]).toMatchObject({ from: "2026-11-01", to: "2026-11-01", label: "wk 44" });
    expect(buckets.at(-1)).toMatchObject({ from: "2026-11-30", to: "2026-11-30" });
    expect(buckets).toHaveLength(6);
  });

  it("a year has 12 month buckets", () => {
    const buckets = periodBuckets("year", "2026-11-18");
    expect(buckets).toHaveLength(12);
    expect(buckets[1]).toMatchObject({ from: "2026-02-01", to: "2026-02-28" });
  });

  it("shifts to the previous/next period", () => {
    expect(shiftPeriod("week", "2026-11-18", -1)).toBe("2026-11-11");
    expect(shiftPeriod("month", "2026-01-31", 1)).toBe("2026-02-28");
    expect(shiftPeriod("year", "2026-11-18", 1)).toBe("2027-11-18");
  });
});

describe("bucketHours", () => {
  it("sums entries per bucket and resource, ignores hidden resources and days outside the period", () => {
    const buckets = periodBuckets("week", "2026-11-18");
    const cells = bucketHours(
      [
        { resourceId: 1, day: "2026-11-16", hours: 4 },
        { resourceId: 1, day: "2026-11-16", hours: 3.5 },
        { resourceId: 2, day: "2026-11-17", hours: 8 },
        { resourceId: 3, day: "2026-11-17", hours: 8 }, // hidden
        { resourceId: 1, day: "2026-11-23", hours: 8 }, // next week
      ],
      buckets,
      [1, 2],
    );
    expect(cells["2026-11-16"]).toEqual({ 1: 7.5, 2: 0 });
    expect(cells["2026-11-17"]).toEqual({ 1: 0, 2: 8 });
    expect(totalsPerResource(cells, [1, 2])).toEqual({ 1: 7.5, 2: 8 });
  });
});

describe("allocatePlannedHours", () => {
  it("gives each resource the block length, capped by its open hours on the todo", () => {
    const entries = allocatePlannedHours([
      {
        // Two 8 h blocks; Cis (1) planned 16 h, Ken (2) only 8 h.
        appointments: [
          { startAt: "2026-11-17T07:00:00Z", durationMinutes: 480 },
          { startAt: "2026-11-16T07:00:00Z", durationMinutes: 480 },
        ],
        resources: [
          { resourceId: 1, hours: 16 },
          { resourceId: 2, hours: 8 },
        ],
      },
    ]);
    expect(entries).toEqual([
      { resourceId: 1, day: "2026-11-16", hours: 8 },
      { resourceId: 2, day: "2026-11-16", hours: 8 },
      { resourceId: 1, day: "2026-11-17", hours: 8 },
    ]);
  });

  it("uses the Brussels day of a block", () => {
    const [entry] = allocatePlannedHours([
      { appointments: [{ startAt: "2026-11-16T23:30:00Z", durationMinutes: 60 }], resources: [{ resourceId: 1, hours: 2 }] },
    ]);
    expect(entry.day).toBe("2026-11-17");
  });
});

describe("chart helpers", () => {
  it("niceTicks rounds the axis up to a readable step", () => {
    expect(niceTicks(37)).toEqual([0, 10, 20, 30, 40]);
    expect(niceTicks(7.5)).toEqual([0, 2, 4, 6, 8]);
    expect(niceTicks(0)).toEqual([0, 1]);
  });

  it("a resource keeps its color whatever is filtered; beyond 8 it is gray", () => {
    const all = [5, 2, 9];
    expect(resourceColor(2, all)).toBe(SERIES_COLORS[0]);
    expect(resourceColor(9, all)).toBe(SERIES_COLORS[2]);
    const many = Array.from({ length: 10 }, (_, i) => i + 1);
    expect(resourceColor(10, many)).toBe(OVERFLOW_COLOR);
  });
});

describe("period titles", () => {
  it("are Dutch: month capitalised, months in a week title lowercase", () => {
    expect(periodRange("month", "2026-11-18").title).toBe("November 2026");
    expect(periodRange("week", "2026-11-18").title).toBe("Week 47 · 16 nov – 22 nov 2026");
  });
});
