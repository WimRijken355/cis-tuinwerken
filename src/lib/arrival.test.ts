import { DateTime } from "luxon";
import { describe, expect, it } from "vitest";
import { arrivalDefaultTime, arrivalIso, isTime, workStart } from "./arrival";
import { appointmentUpdateSchema } from "./schemas/appointments";

describe("isTime", () => {
  it("aanvaardt HH:mm en weigert de rest", () => {
    expect(isTime("08:05")).toBe(true);
    expect(isTime("23:59")).toBe(true);
    expect(isTime("24:00")).toBe(false);
    expect(isTime("8:05")).toBe(false);
    expect(isTime("")).toBe(false);
  });
});

describe("arrivalIso", () => {
  it("zet de gekozen tijd op de Brusselse dag van de afspraak (zomertijd)", () => {
    expect(arrivalIso("2026-06-15T06:00:00.000Z", "08:12")).toBe("2026-06-15T06:12:00.000Z");
  });

  it("houdt rekening met wintertijd", () => {
    expect(arrivalIso("2026-11-26T07:00:00.000Z", "07:45")).toBe("2026-11-26T06:45:00.000Z");
  });

  it("gebruikt de Brusselse dag, ook als die in UTC nog de vorige dag is", () => {
    // 00:30 Brussels on 16 June = 22:30 UTC on 15 June.
    expect(arrivalIso("2026-06-15T22:30:00.000Z", "06:00")).toBe("2026-06-16T04:00:00.000Z");
  });

  it("weigert een ongeldige tijd", () => {
    expect(() => arrivalIso("2026-06-15T06:00:00.000Z", "25:00")).toThrow();
  });
});

describe("arrivalDefaultTime", () => {
  it("toont de al ingegeven starttijd", () => {
    expect(arrivalDefaultTime("2026-06-15T06:12:00.000Z")).toBe("08:12");
  });

  it("stelt anders 'nu' voor (Brusselse tijd)", () => {
    const now = DateTime.fromISO("2026-11-26T09:37:00.000Z");
    expect(arrivalDefaultTime(null, now)).toBe("10:37");
  });
});

describe("workStart", () => {
  it("neemt de aankomst als die er is, anders het geplande begin", () => {
    expect(workStart({ startAt: "2026-06-15T06:00:00.000Z", arrivedAt: "2026-06-15T06:20:00.000Z" })).toBe(
      "2026-06-15T06:20:00.000Z",
    );
    expect(workStart({ startAt: "2026-06-15T06:00:00.000Z", arrivedAt: null })).toBe("2026-06-15T06:00:00.000Z");
  });
});

describe("appointmentUpdateSchema arrivedAt", () => {
  it("aanvaardt een tijdstip, null (wissen) of niets", () => {
    expect(appointmentUpdateSchema.parse({ arrivedAt: "2026-06-15T06:20:00.000Z" }).arrivedAt).toBe(
      "2026-06-15T06:20:00.000Z",
    );
    expect(appointmentUpdateSchema.parse({ arrivedAt: null }).arrivedAt).toBeNull();
    expect("arrivedAt" in appointmentUpdateSchema.parse({})).toBe(false);
  });
});
