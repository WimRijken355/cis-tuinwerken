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

/** Proposed time in the arrival sheet: the recorded one, otherwise "now". */
export function arrivalDefaultTime(arrivedAt: string | null, now: DateTime = DateTime.now()): string {
  return (arrivedAt ? toBrussels(arrivedAt) : now.setZone(ZONE)).toFormat("HH:mm");
}

/** Start of the work when registering: the arrival if recorded, else the planned start. */
export function workStart(appointment: { startAt: string; arrivedAt: string | null }): string {
  return appointment.arrivedAt ?? appointment.startAt;
}
