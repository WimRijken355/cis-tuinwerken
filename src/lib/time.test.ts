import { describe, expect, it } from "vitest";
import {
  brusselsDayRangeUtc,
  formatDate,
  formatDateShort,
  formatTime,
  isSameBrusselsDay,
} from "./time";

describe("brusselsDayRangeUtc", () => {
  it("geeft een range van precies 24 uur", () => {
    const { start, end } = brusselsDayRangeUtc(0);
    expect(end.getTime() - start.getTime()).toBe(24 * 60 * 60 * 1000);
  });

  it("offsetDays schuift de range exact een dag op", () => {
    const today = brusselsDayRangeUtc(0);
    const tomorrow = brusselsDayRangeUtc(1);
    expect(tomorrow.start.getTime() - today.start.getTime()).toBe(24 * 60 * 60 * 1000);
  });
});

describe("isSameBrusselsDay", () => {
  it("is waar voor twee tijdstippen op dezelfde kalenderdag in Brussel", () => {
    expect(isSameBrusselsDay("2026-06-15T05:00:00Z", "2026-06-15T20:00:00Z")).toBe(true);
  });

  it("is onwaar rond middernacht Brusselse tijd (zomertijd, UTC+2)", () => {
    // 2026-06-15T22:30:00Z = 2026-06-16T00:30 lokale tijd → andere dag.
    expect(isSameBrusselsDay("2026-06-15T21:00:00Z", "2026-06-15T22:30:00Z")).toBe(false);
  });
});

describe("formatTime / formatDateShort / formatDate", () => {
  it("formatTime geeft HH:mm in lokale (Brusselse) tijd", () => {
    expect(formatTime("2026-06-15T08:30:00Z")).toBe("10:30");
  });

  it("formatDateShort geeft dd/MM/yyyy", () => {
    expect(formatDateShort("2026-01-05T12:00:00Z")).toBe("05/01/2026");
  });

  it("formatDate geeft een Nederlandse weekdag + datum", () => {
    expect(formatDate("2026-06-15T12:00:00Z")).toContain("juni");
  });
});
