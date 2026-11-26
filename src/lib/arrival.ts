import { DateTime } from "luxon";
import { ZONE, toBrussels } from "./time";

/**
 * "Aangekomen" on the Dagplanning: the user records the actual start time on
 * site (chosen freely, default = now). It is stored as `Appointment.arrivedAt`
 * on the Brussels day of the appointment and becomes the default "van" when
 * registering (klaarmelden).
 */

/** "HH:mm" (24 h). */
export function isTime(value: string): boolean {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}

/**
 * The arrival moment (UTC ISO) for a chosen "HH:mm" on the Brussels day of the
 * appointment — also when the start is entered later or for another day.
 */
export function arrivalIso(appointmentStartAt: Date | string, time: string): string {
  if (!isTime(time)) throw new Error(`Ongeldige tijd: ${time}`);
  const [hour, minute] = time.split(":").map(Number);
  const day = toBrussels(appointmentStartAt).toISODate()!;
  return DateTime.fromISO(day, { zone: ZONE }).set({ hour, minute }).toUTC().toISO()!;
}

/** All quarter hours of a day: "00:00", "00:15", … "23:45" (the time pickers). */
export const QUARTER_TIMES: readonly string[] = Array.from({ length: 96 }, (_, i) =>
  `${String(Math.floor(i / 4)).padStart(2, "0")}:${String((i % 4) * 15).padStart(2, "0")}`,
);

/** "HH:mm" rounded to the nearest quarter hour, kept within the day (max. 23:45). */
export function roundToQuarter(time: string): string {
  if (!isTime(time)) return time;
  const [h, m] = time.split(":").map(Number);
  const quarters = Math.min(Math.round((h * 60 + m) / 15), QUARTER_TIMES.length - 1);
  return QUARTER_TIMES[quarters];
}

/** Proposed time in the arrival sheet: the recorded one, otherwise "now" — per quarter hour. */
export function arrivalDefaultTime(arrivedAt: string | null, now: DateTime = DateTime.now()): string {
  return roundToQuarter((arrivedAt ? toBrussels(arrivedAt) : now.setZone(ZONE)).toFormat("HH:mm"));
}

/** Start of the work when registering: the arrival if recorded, else the planned start. */
export function workStart(appointment: { startAt: string; arrivedAt: string | null }): string {
  return appointment.arrivedAt ?? appointment.startAt;
}
