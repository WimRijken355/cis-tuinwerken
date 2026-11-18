import { DateTime } from "luxon";

/**
 * Alle datum/tijd-logica van de app loopt via deze helpers.
 *
 * Afspraak: de database bevat uitsluitend UTC. Alles wat "een dag" is
 * (vandaag, morgen, zelfde dag?) wordt berekend in Europe/Brussels — nooit in
 * servertijd en nooit in de database. Zo blijven zomer-/wintertijd correct.
 */

export const ZONE = "Europe/Brussels";

export function nowBrussels(): DateTime {
  return DateTime.now().setZone(ZONE);
}

export function toBrussels(date: Date | string): DateTime {
  return (typeof date === "string" ? DateTime.fromISO(date) : DateTime.fromJSDate(date)).setZone(
    ZONE,
  );
}

/** UTC-range [start, eind) van een Brusselse kalenderdag, `offsetDays` vanaf vandaag. */
export function brusselsDayRangeUtc(offsetDays = 0): { start: Date; end: Date } {
  const day = nowBrussels().plus({ days: offsetDays }).startOf("day");
  return { start: day.toUTC().toJSDate(), end: day.plus({ days: 1 }).toUTC().toJSDate() };
}

/** Today as a Brussels calendar day, "yyyy-MM-dd". */
export function todayBrussels(): string {
  return nowBrussels().toISODate()!;
}

/** Is "yyyy-MM-dd" a valid calendar day? */
export function isIsoDay(day: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(day) && DateTime.fromISO(day, { zone: ZONE }).isValid;
}

/** UTC range [start, end) of the Brussels calendar day "yyyy-MM-dd". */
export function brusselsDayRangeForDate(day: string): { start: Date; end: Date } {
  const start = DateTime.fromISO(day, { zone: ZONE }).startOf("day");
  return { start: start.toUTC().toJSDate(), end: start.plus({ days: 1 }).toUTC().toJSDate() };
}

/** "yyyy-MM-dd" shifted by n days (n may be negative). */
export function shiftDay(day: string, days: number): string {
  return DateTime.fromISO(day, { zone: ZONE }).plus({ days }).toISODate()!;
}

/** Vallen twee tijdstippen op dezelfde Brusselse kalenderdag? */
export function isSameBrusselsDay(a: Date | string, b: Date | string): boolean {
  return toBrussels(a).hasSame(toBrussels(b), "day");
}

// --- Weergave (Nederlands) --------------------------------------------------

export function formatTime(date: Date | string): string {
  return toBrussels(date).toFormat("HH:mm");
}

export function formatDate(date: Date | string): string {
  return toBrussels(date).setLocale("nl").toFormat("cccc d LLLL");
}

export function formatDateShort(date: Date | string): string {
  return toBrussels(date).toFormat("dd/MM/yyyy");
}
