import { DateTime } from "luxon";
import { ZONE } from "./time";

/**
 * Pure planning rules (no DB/network, unit tested in planning.test.ts).
 *
 * A todo has a total estimate (estimatedHours). It is planned as one or more
 * appointments ("blocks"); what is not planned yet is the *remaining* time,
 * always derived (estimate − sum of planned blocks), never stored. So:
 * - dropping a todo creates a block of at most one working day;
 * - shortening a block automatically raises the remaining time again;
 * - the planning sidebar shows every todo that still has remaining time.
 */

export const WORKDAY_MINUTES = 8 * 60;
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
export function dropDurationMinutes(remaining: number, start: Date | string): number {
  const cap = Math.min(remaining > 0 ? remaining : SLOT_MINUTES, WORKDAY_MINUTES, minutesUntilMidnight(start));
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
): Map<number, { index: number; total: number }> {
  const sorted = [...blocks].sort(
    (a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime() || a.id - b.id,
  );
  const total = sorted.length + Math.ceil(remaining / WORKDAY_MINUTES);
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
