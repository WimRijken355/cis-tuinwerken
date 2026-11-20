import { DateTime } from "luxon";

/**
 * Outlook-style recurrence of recurring work ("Terugkerend werk"):
 * - WEEKLY: every `interval` weeks on one or more weekdays;
 * - MONTHLY: every `interval` months on day N, or on the Nth (or last) weekday;
 * starting at `startDate`, ending never / on `endDate` / after
 * `maxOccurrences` times, optionally only within a yearly season
 * (`seasonStartMonth`..`seasonEndMonth`, may wrap the year end).
 *
 * Each occurrence becomes one todo in "In te plannen" with a preferred window
 * from that day until the day before the next occurrence. Pure calendar-day
 * logic on "yyyy-MM-dd" strings (no time zones involved), no database.
 * The yearly PERIODS pattern (hedge in May + Sep–Oct) lives in
 * services/recurring.ts (concreteWindow).
 */

export type RecurrenceKind = "PERIODS" | "WEEKLY" | "MONTHLY";
export type MonthlyMode = "DAY_OF_MONTH" | "NTH_WEEKDAY";

export interface RecurrenceRule {
  kind: "WEEKLY" | "MONTHLY";
  interval: number;
  /** WEEKLY: ISO weekdays 1 (Mon) .. 7 (Sun). */
  weekdays: number[];
  monthlyMode?: MonthlyMode | null;
  monthDay?: number | null;
  /** 1..4, or 5 = last. */
  monthWeek?: number | null;
  monthWeekday?: number | null;
  /** "yyyy-MM-dd" */
  startDate: string;
  endDate?: string | null;
  maxOccurrences?: number | null;
  seasonStartMonth?: number | null;
  seasonEndMonth?: number | null;
}

export const WEEKDAY_SHORT_NL = ["ma", "di", "wo", "do", "vr", "za", "zo"] as const;
export const WEEKDAY_LONG_NL = ["maandag", "dinsdag", "woensdag", "donderdag", "vrijdag", "zaterdag", "zondag"] as const;
export const MONTH_SHORT_NL = ["jan", "feb", "mrt", "apr", "mei", "jun", "jul", "aug", "sep", "okt", "nov", "dec"] as const;
export const NTH_LABELS_NL: Record<number, string> = { 1: "eerste", 2: "tweede", 3: "derde", 4: "vierde", 5: "laatste" };

const day = (iso: string) => DateTime.fromISO(iso, { zone: "utc" });
const iso = (d: DateTime) => d.toISODate()!;

/** Is the month inside the season? No season = always. A season may wrap the year end (nov–feb). */
export function inSeason(month: number, start?: number | null, end?: number | null): boolean {
  if (!start || !end) return true;
  return start <= end ? month >= start && month <= end : month >= start || month <= end;
}

/** The Nth (1..4) or last (5) given weekday of a month. */
function nthWeekdayOf(year: number, month: number, nth: number, weekday: number): DateTime {
  const first = DateTime.fromObject({ year, month, day: 1 }, { zone: "utc" });
  if (nth >= 5) {
    const last = first.endOf("month").startOf("day");
    return last.minus({ days: (last.weekday - weekday + 7) % 7 });
  }
  return first.plus({ days: (weekday - first.weekday + 7) % 7 + (nth - 1) * 7 });
}

/** Safety net: never iterate beyond this many periods (≈ 40 years weekly). */
const MAX_PERIODS = 2100;

/**
 * All occurrence dates from the start up to and including `until`
 * ("yyyy-MM-dd"), in order; the season, end date and max count applied.
 * `maxOccurrences` counts the occurrences that are actually generated
 * (inside the season).
 */
export function occurrencesUntil(rule: RecurrenceRule, until: string): string[] {
  const start = day(rule.startDate);
  const limit = rule.endDate && rule.endDate < until ? day(rule.endDate) : day(until);
  const interval = Math.max(1, rule.interval);
  const result: string[] = [];
  const push = (d: DateTime): boolean => {
    if (d < start || d > limit) return true;
    if (!inSeason(d.month, rule.seasonStartMonth, rule.seasonEndMonth)) return true;
    result.push(iso(d));
    return !(rule.maxOccurrences && result.length >= rule.maxOccurrences);
  };

  if (rule.kind === "WEEKLY") {
    const weekdays = [...new Set(rule.weekdays)].filter((w) => w >= 1 && w <= 7).sort();
    if (weekdays.length === 0) return [];
    const firstMonday = start.minus({ days: start.weekday - 1 });
    for (let k = 0; k < MAX_PERIODS; k += interval) {
      const monday = firstMonday.plus({ weeks: k });
      if (monday > limit) break;
      for (const wd of weekdays) if (!push(monday.plus({ days: wd - 1 }))) return result;
    }
    return result;
  }

  for (let k = 0; k < MAX_PERIODS; k += interval) {
    const month = start.startOf("month").plus({ months: k });
    if (month > limit) break;
    let d: DateTime;
    if (rule.monthlyMode === "NTH_WEEKDAY") {
      d = nthWeekdayOf(month.year, month.month, rule.monthWeek ?? 1, rule.monthWeekday ?? 1);
    } else {
      const wanted = rule.monthDay ?? start.day;
      d = month.set({ day: Math.min(wanted, month.daysInMonth ?? 28) });
    }
    if (!push(d)) return result;
  }
  return result;
}

export interface Occurrence {
  /** The occurrence day ("yyyy-MM-dd"). */
  date: string;
  /** Preferred window of its todo: the day itself until the day before the next occurrence. */
  windowStart: string;
  windowEnd: string;
}

/**
 * Preferred window of each occurrence: up to the day before the next one.
 * The last one gets one period (interval weeks / months), so it never runs
 * on forever.
 */
export function withWindows(rule: RecurrenceRule, dates: string[], nextAfterLast?: string): Occurrence[] {
  return dates.map((date, i) => {
    const next = dates[i + 1] ?? nextAfterLast;
    const period =
      rule.kind === "WEEKLY"
        ? day(date).plus({ weeks: Math.max(1, rule.interval) })
        : day(date).plus({ months: Math.max(1, rule.interval) });
    const nextDay = next ? DateTime.min(day(next), period) : period;
    const end = DateTime.max(day(date), nextDay.minus({ days: 1 }));
    return { date, windowStart: date, windowEnd: iso(end) };
  });
}

/**
 * Occurrences whose todo must exist today: visible from `leadTimeDays`
 * before the day, until its window has passed (same rule as the yearly
 * periods). The job creates them idempotently (template + date).
 */
export function dueOccurrences(rule: RecurrenceRule, today: string, leadTimeDays: number): Occurrence[] {
  const horizon = iso(day(today).plus({ days: leadTimeDays }));
  // Look a bit further to know the next occurrence (window end of the last due one).
  const lookahead = iso(day(horizon).plus({ months: Math.max(1, rule.interval) * 2, weeks: 1 }));
  const all = occurrencesUntil(rule, lookahead);
  const windows = withWindows(rule, all);
  return windows.filter((o) => o.date <= horizon && o.windowEnd >= today);
}

/** Problems with a rule, in Dutch for the form; empty = valid. */
export function recurrenceProblems(rule: Partial<Omit<RecurrenceRule, "kind">> & { kind: RecurrenceKind }): string[] {
  if (rule.kind === "PERIODS") return [];
  const problems: string[] = [];
  if (!rule.startDate) problems.push("Kies een begindatum.");
  if (!rule.interval || rule.interval < 1) problems.push("Het interval moet minstens 1 zijn.");
  if (rule.kind === "WEEKLY" && !(rule.weekdays ?? []).some((w) => w >= 1 && w <= 7)) {
    problems.push("Kies minstens één weekdag.");
  }
  if (rule.kind === "MONTHLY") {
    if (rule.monthlyMode === "NTH_WEEKDAY") {
      if (!rule.monthWeek || !rule.monthWeekday) problems.push("Kies welke weekdag van de maand.");
    } else if (!rule.monthDay || rule.monthDay < 1 || rule.monthDay > 31) {
      problems.push("Kies een dag van de maand (1–31).");
    }
  }
  if (rule.endDate && rule.startDate && rule.endDate < rule.startDate) {
    problems.push("De einddatum ligt vóór de begindatum.");
  }
  if ((rule.seasonStartMonth == null) !== (rule.seasonEndMonth == null)) {
    problems.push("Kies zowel het begin als het einde van het seizoen.");
  }
  return problems;
}

const shortDate = (d: string) => day(d).toFormat("d/M/yyyy");

/** "Om de 2 weken op di en vr · apr–okt · vanaf 1/3/2027 · 10 keer" */
export function describeRecurrence(rule: RecurrenceRule): string {
  const n = Math.max(1, rule.interval);
  let text: string;
  if (rule.kind === "WEEKLY") {
    const days = [...new Set(rule.weekdays)].sort().map((w) => WEEKDAY_SHORT_NL[w - 1]);
    const list = days.length > 1 ? `${days.slice(0, -1).join(", ")} en ${days[days.length - 1]}` : (days[0] ?? "?");
    text = `${n === 1 ? "Elke week" : `Om de ${n} weken`} op ${list}`;
  } else {
    const when =
      rule.monthlyMode === "NTH_WEEKDAY"
        ? `de ${NTH_LABELS_NL[rule.monthWeek ?? 1]} ${WEEKDAY_LONG_NL[(rule.monthWeekday ?? 1) - 1]}`
        : `dag ${rule.monthDay ?? day(rule.startDate).day}`;
    text = `${n === 1 ? "Elke maand" : `Om de ${n} maanden`} op ${when}`;
  }
  const parts = [text];
  if (rule.seasonStartMonth && rule.seasonEndMonth) {
    parts.push(`${MONTH_SHORT_NL[rule.seasonStartMonth - 1]}–${MONTH_SHORT_NL[rule.seasonEndMonth - 1]}`);
  }
  parts.push(`vanaf ${shortDate(rule.startDate)}`);
  if (rule.endDate) parts.push(`tot ${shortDate(rule.endDate)}`);
  else if (rule.maxOccurrences) parts.push(`${rule.maxOccurrences} keer`);
  return parts.join(" · ");
}
