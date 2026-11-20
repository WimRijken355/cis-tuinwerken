import { describe, expect, it } from "vitest";
import { adHocBlockMinutes, registerBackHref, registerBackLabel, registerHref } from "./register-link";

const params = (query: string) => new URLSearchParams(query);

describe("registerHref", () => {
  it("links to the wizard, with the Dagplanning day or a back page", () => {
    expect(registerHref(7)).toBe("/daily-planning/7/register");
    expect(registerHref(7, { date: "2026-11-20" })).toBe("/daily-planning/7/register?date=2026-11-20");
    expect(registerHref(7, { back: "/todos" })).toBe("/daily-planning/7/register?back=%2Ftodos");
  });
});

describe("registerBackHref", () => {
  it("returns to the Todo's overview when opened from there", () => {
    expect(registerBackHref(params("back=%2Ftodos"))).toBe("/todos");
  });
  it("defaults to the Dagplanning (of the given day)", () => {
    expect(registerBackHref(params(""))).toBe("/daily-planning");
    expect(registerBackHref(params("date=2026-11-20"))).toBe("/daily-planning?date=2026-11-20");
  });
  it("never sends the user to an unknown or external page", () => {
    expect(registerBackHref(params("back=https%3A%2F%2Fevil.example"))).toBe("/daily-planning");
    expect(registerBackHref(params("back=%2F%2Fevil.example"))).toBe("/daily-planning");
    expect(registerBackHref(params("date=x%3Cscript"))).toBe("/daily-planning");
  });
});

describe("adHocBlockMinutes", () => {
  it("takes the time left of the todo, per quarter", () => {
    expect(adHocBlockMinutes(3, [])).toBe(180);
    expect(adHocBlockMinutes(3, [{ status: "DONE", durationMinutes: 100 }])).toBe(90);
  });
  it("at least 1 hour, at most a workday; cancelled blocks do not count", () => {
    expect(adHocBlockMinutes(2, [{ status: "DONE", durationMinutes: 120 }])).toBe(60);
    expect(adHocBlockMinutes(20, [])).toBe(600); // default workday 10 h
    expect(adHocBlockMinutes(20, [], 480)).toBe(480); // setting at 8 h
    expect(adHocBlockMinutes(2, [{ status: "CANCELLED", durationMinutes: 120 }])).toBe(120);
  });
});

describe("registerBackLabel", () => {
  it("names the page the wizard returns to", () => {
    expect(registerBackLabel("/todos")).toBe("Todo's");
    expect(registerBackLabel("/daily-planning?date=2026-11-20")).toBe("Dagplanning");
  });
});
