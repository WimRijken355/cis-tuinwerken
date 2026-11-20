import { DateTime } from "luxon";
import { ZONE } from "./time";

/**
 * Pure planning rules (no DB/network, unit tested in planning.test.ts).
 *
 * A todo has a total estimate (estimatedHours). It is planned as one or more
 * appointments ("blocks"); what is not planned yet is the *remaining* time,
 * always derived (estimate − sum of planned blocks), never stored. So:
 * - dropping a todo creates a block of at most one working day (setting
 *   "max. uren per ingepland blok", default 10 h — `workdayMinutes`);
 * - shortening a block automatically raises the remaining time again;
 * - the planning sidebar shows every todo that still has remaining time.
 */

/** Default max. length of one planned block ("werkdag"); configurable in Settings (maxBlockHours). */
export const DEFAULT_WORKDAY_MINUTES = 10 * 60;

/** Max. block length in minutes from the setting (hours), rounded to whole slots. */
export function workdayMinutesFrom(maxBlockHours: number | null | undefined): number {
  if (!maxBlockHours || maxBlockHours <= 0) return DEFAULT_WORKDAY_MINUTES;
  return Math.max(15, Math.round((maxBlockHours * 60) / 15) * 15);
}
/** Grid snap / minimum block length. */
export const SLOT_MINUTES = 15;

type PlannedBlock = { durationMinutes: number; status: "PLANNED" | "DONE" | "CANCELLED" };

/** Minutes planned in blocks that count (cancelled ones don't). */
export function plannedMinutes(blocks: PlannedBlock[]): number {
  return blocks.filter((b) => b.status !== "CANCELLED").reduce((sum, b) => sum + b.durationMinutes, 0);
}

/** Estimate minus planned, never below zero. */
export function remainingMinutes(estimatedHours: number, planned: number): number {
  return Math.max(0, Math.round(estimatedHours * 60) - planned);
}

/** Minutes from `start` until midnight (Europe/Brussels) of that same day. */
export function minutesUntilMidnight(start: Date | string): number {
  const dt = (typeof start === "string" ? DateTime.fromISO(start) : DateTime.fromJSDate(start)).setZone(ZONE);
  return Math.round(dt.endOf("day").plus({ milliseconds: 1 }).diff(dt, "minutes").minutes);
}

/**
 * Length of the block created when a todo is dropped at `start`: the
 * remaining time, but at most one working day and never past midnight,
 * rounded down to whole slots (at least one slot).
 */
export function dropDurationMinutes(
  remaining: number,
  start: Date | string,
  workdayMinutes: number = DEFAULT_WORKDAY_MINUTES,
): number {
  // Nothing left by the estimate (a follow-up day): propose a working day.
  const cap = Math.min(remaining > 0 ? remaining : workdayMinutes, workdayMinutes, minutesUntilMidnight(start));
  return Math.max(SLOT_MINUTES, Math.floor(cap / SLOT_MINUTES) * SLOT_MINUTES);
}

/**
 * "Part x of y" per block of one todo: x follows the chronological order,
 * y = blocks planned so far + the working days still needed for the
 * remaining time (so a 40 h todo with one block planned shows 1/5).
 */
export function partNumbers(
  blocks: { id: number; startAt: Date | string }[],
  remaining: number,
  workdayMinutes: number = DEFAULT_WORKDAY_MINUTES,
): Map<number, { index: number; total: number }> {
  const sorted = [...blocks].sort(
    (a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime() || a.id - b.id,
  );
  const total = sorted.length + Math.ceil(remaining / workdayMinutes);
  return new Map(sorted.map((b, i) => [b.id, { index: i + 1, total }]));
}

/** "2/3"; empty when a todo fits in a single block (1/1). */
export function partLabel(part: { index: number; total: number } | undefined): string {
  return part && part.total > 1 ? `${part.index}/${part.total}` : "";
}

/** Distinct, readable colours; every todo gets one so its blocks are recognisable. */
export const TODO_COLORS = [
  "#2f7d4f", // green
  "#2563eb", // blue
  "#b45309", // amber
  "#7c3aed", // violet
  "#be123c", // rose
  "#0f766e", // teal
  "#4d7c0f", // olive
  "#c2410c", // orange
  "#1d4ed8", // indigo
  "#a21caf", // fuchsia
] as const;
/** Losse todo's (holiday, doctor, ...) are always grey. */
export const LOOSE_TODO_COLOR = "#6b7280";

export function todoColor(todoId: number, isLoose = false): string {
  return isLoose ? LOOSE_TODO_COLOR : TODO_COLORS[todoId % TODO_COLORS.length];
}

/**
 * "Bevestigd" (confirmed to the customer) and "reservatie" (provisional)
 * exclude each other: switching one on switches the other off.
 */
export function applyPlanningFlags(
  current: { confirmed: boolean; reservation: boolean },
  input: { confirmed?: boolean; reservation?: boolean },
): { confirmed: boolean; reservation: boolean } {
  const next = { ...current };
  if (input.confirmed !== undefined) {
    next.confirmed = input.confirmed;
    if (input.confirmed) next.reservation = false;
  }
  if (input.reservation !== undefined) {
    next.reservation = input.reservation;
    if (input.reservation) next.confirmed = false;
  }
  return next;
}

/** Human readable hours, "2,5 u". */
export function formatMinutesAsHours(minutes: number): string {
  return `${String(Math.round((minutes / 60) * 100) / 100).replace(".", ",")} u`;
}

// ---------------------------------------------------------------------------
// Sidebar filters / grouping (also used to fade non-matching grid blocks)
// ---------------------------------------------------------------------------

export interface PlanningFilter {
  /** Free text: matches the todo title, the customer name and the city. */
  text: string;
  /** Selected cities; the item must be in ONE of them ([] = all). */
  cities: string[];
  /** Selected resources; the todo must have AT LEAST ONE of them ([] = all). */
  resourceIds: number[];
}

export const EMPTY_PLANNING_FILTER: PlanningFilter = { text: "", cities: [], resourceIds: [] };

export interface PlanningFilterSubject {
  title: string;
  customerName: string;
  city: string | null;
  resourceIds: number[];
}

/** Label used for todos without a city (losse todo's, unknown address). */
export const NO_CITY_LABEL = "Zonder plaats";

/** Lower case, without accents, trimmed — for forgiving text search. */
export const normalize = (s: string) =>
  s
    .toLocaleLowerCase("nl-BE")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();

export function isFilterActive(f: PlanningFilter): boolean {
  return f.text.trim() !== "" || f.cities.length > 0 || f.resourceIds.length > 0;
}

/**
 * Does a todo / block satisfy the filter? Text, cities and resources must all
 * match (AND); within cities and within resources one hit is enough (OR).
 */
export function matchesPlanningFilter(item: PlanningFilterSubject, f: PlanningFilter): boolean {
  const words = normalize(f.text).split(/\s+/).filter(Boolean);
  if (words.length > 0) {
    const haystack = normalize(`${item.title} ${item.customerName} ${item.city ?? ""}`);
    if (!words.every((w) => haystack.includes(w))) return false;
  }
  if (f.cities.length > 0 && !f.cities.includes(item.city?.trim() || NO_CITY_LABEL)) return false;
  if (f.resourceIds.length > 0 && !f.resourceIds.some((id) => item.resourceIds.includes(id))) return false;
  return true;
}

/**
 * Groups items per city (alphabetically, "Zonder plaats" last) so jobs in
 * the same region can be planned together.
 */
export function groupByCity<T>(items: T[], cityOf: (item: T) => string | null): { city: string; items: T[] }[] {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const city = cityOf(item)?.trim() || NO_CITY_LABEL;
    groups.set(city, [...(groups.get(city) ?? []), item]);
  }
  return [...groups.entries()]
    .sort(([a], [b]) =>
      a === NO_CITY_LABEL ? 1 : b === NO_CITY_LABEL ? -1 : a.localeCompare(b, "nl-BE"),
    )
    .map(([city, list]) => ({ city, items: list }));
}

// ---------------------------------------------------------------------------
// Focus: one todo selected in the sidebar or in the grid
// ---------------------------------------------------------------------------

/** Clicking the focused todo again clears the focus; another todo takes it over. */
export function toggleFocus(current: number | null, clicked: number): number | null {
  return current === clicked ? null : clicked;
}

/**
 * How a grid block is shown, given the focused todo and the sidebar filter:
 * blocks of the focused todo are highlighted, other blocks fade a bit while a
 * todo is focused, and blocks that do not match the filter fade strongly.
 */
export function blockEmphasis(input: {
  todoId: number;
  focusTodoId: number | null;
  matchesFilter: boolean;
}): { highlighted: boolean; opacity: number } {
  const highlighted = input.focusTodoId !== null && input.todoId === input.focusTodoId;
  if (highlighted) return { highlighted, opacity: 1 };
  if (!input.matchesFilter) return { highlighted, opacity: 0.25 };
  return { highlighted, opacity: input.focusTodoId !== null ? 0.55 : 1 };
}

/** Rounds minutes to the nearest whole quarter (at least one). */
export function roundToQuarter(minutes: number): number {
  return Math.max(SLOT_MINUTES, Math.round(minutes / SLOT_MINUTES) * SLOT_MINUTES);
}


/** Minute choices of a duration: whole quarters only. */
export const QUARTER_MINUTES = [0, 15, 30, 45] as const;

/** 150 → { hours: 2, minutes: 30 } (rounded to whole quarters first). */
export function splitDuration(totalMinutes: number): { hours: number; minutes: number } {
  const rounded = roundToQuarter(totalMinutes);
  return { hours: Math.floor(rounded / 60), minutes: rounded % 60 };
}

/** Upper bound for a duration typed in the plan dialog (a large multi-day job). */
export const MAX_PLAN_MINUTES = 999 * 60;

/**
 * Hours + quarter minutes → total minutes, at least one quarter and at most
 * `maxMinutes`: 0 u 00 → 15, 20 u 30 → 1230. Invalid hours count as 0.
 */
export function joinDuration(hours: number, minutes: number, maxMinutes = MAX_PLAN_MINUTES): number {
  const h = Number.isFinite(hours) && hours > 0 ? Math.floor(hours) : 0;
  return Math.min(Math.max(h * 60 + minutes, SLOT_MINUTES), maxMinutes);
}

/**
 * Splits a planned duration over consecutive working days (Mon–Fri, Europe/
 * Brussels): every day at the same start time, at most one working day and
 * never past midnight; weekends are skipped (also when the start date itself
 * is in a weekend, that first day is kept — the user chose it explicitly).
 */
export function splitOverWorkdays(
  date: string, // yyyy-MM-dd
  time: string, // HH:mm
  totalMinutes: number,
  workdayMinutes: number = DEFAULT_WORKDAY_MINUTES,
): { startAt: string; durationMinutes: number }[] {
  const blocks: { startAt: string; durationMinutes: number }[] = [];
  let day = DateTime.fromISO(`${date}T${time}`, { zone: ZONE });
  let left = totalMinutes;
  while (left > 0 && blocks.length < 200) {
    const minutes = Math.min(left, workdayMinutes, minutesUntilMidnight(day.toJSDate()));
    blocks.push({ startAt: day.toUTC().toISO()!, durationMinutes: minutes });
    left -= minutes;
    do {
      day = day.plus({ days: 1 });
    } while (day.weekday > 5); // 6 = Saturday, 7 = Sunday
  }
  return blocks;
}

// ---------------------------------------------------------------------------
// Month view: load per day ("which days are still free?")
// ---------------------------------------------------------------------------

/** Planned minutes per Brussels calendar day ("yyyy-MM-dd"), cancelled blocks excluded. */
export function minutesPerDay(
  blocks: { startAt: string; durationMinutes: number; status: "PLANNED" | "DONE" | "CANCELLED" }[],
): Map<string, number> {
  const perDay = new Map<string, number>();
  for (const b of blocks) {
    if (b.status === "CANCELLED") continue;
    const day = DateTime.fromISO(b.startAt).setZone(ZONE).toISODate()!;
    perDay.set(day, (perDay.get(day) ?? 0) + b.durationMinutes);
  }
  return perDay;
}

export type DayLoad = "free" | "partial" | "full";

/** Free (nothing planned), partial, or full (a working day or more). */
export function dayLoad(minutes: number, workdayMinutes: number = DEFAULT_WORKDAY_MINUTES): DayLoad {
  if (minutes <= 0) return "free";
  return minutes >= workdayMinutes ? "full" : "partial";
}

/**
 * Brussels calendar day ("yyyy-MM-dd") of a real Date — e.g. the date of a
 * month cell (local midnight). Not toISOString(): that is UTC and would give
 * the previous day for a Brussels midnight.
 */
export function dayKey(date: Date): string {
  return DateTime.fromJSDate(date).setZone(ZONE).toISODate()!;
}

/**
 * Does a (not finished) todo belong in the "in te plannen" list? When time is
 * left by the estimate, or when a day was registered without invoicing and
 * nothing is planned any more: the job is not done, a follow-up day is needed.
 */
export function needsPlanning(meta: { remainingMinutes: number; plannedBlocks: number; doneBlocks: number }): boolean {
  return meta.remainingMinutes > 0 || (meta.plannedBlocks === 0 && meta.doneBlocks > 0);
}
