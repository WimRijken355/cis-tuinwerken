import { z } from "zod";
import type { TodoResourceDto } from "./todos";

/** Contracten voor /api/appointments. */

const isoDate = z.string().refine((v) => !Number.isNaN(Date.parse(v)), "Ongeldig tijdstip");

export const appointmentInputSchema = z.object({
  todoId: z.number().int().positive(),
  /** ISO-tijdstip (met offset of UTC); de server bewaart UTC. */
  startAt: isoDate,
  /**
   * Omitted when a todo is dropped on the grid: the server then plans the
   * remaining time, capped at one working day and at midnight (dropDurationMinutes).
   */
  durationMinutes: z.number().int().min(15, "Minstens 15 minuten").max(24 * 60).optional(),
  note: z.string().max(2000).optional(),
  confirmed: z.boolean().optional(),
  reservation: z.boolean().optional(),
});
export type AppointmentInput = z.infer<typeof appointmentInputSchema>;

/** PATCH: move/resize, notes, status and the confirmed/reservation flags (no defaults). */
export const appointmentUpdateSchema = z.object({
  startAt: isoDate.optional(),
  durationMinutes: z.number().int().min(15, "Minstens 15 minuten").max(24 * 60).optional(),
  note: z.string().max(2000).optional(),
  status: z.enum(["PLANNED", "CANCELLED"]).optional(),
  confirmed: z.boolean().optional(),
  reservation: z.boolean().optional(),
});
export type AppointmentUpdate = z.infer<typeof appointmentUpdateSchema>;

/** Zoals de API een afspraak teruggeeft (verrijkt met todo- en klantinfo). */
export interface AppointmentDto {
  id: number;
  todoId: number;
  startAt: string; // ISO UTC
  durationMinutes: number;
  status: "PLANNED" | "DONE" | "CANCELLED";
  note: string | null;
  reminderSentAt: string | null;
  reminderError: string | null;
  todoTitle: string;
  estimatedHours: number;
  /** null for a "losse todo" (holiday, doctor, ...). */
  customerId: number | null;
  /** "" for a losse todo. */
  customerName: string;
  isLoose: boolean;
  isDemo: boolean;
  /** Customer city (null for a losse todo or when unknown). */
  customerCity: string | null;
  /** Volledig adres voor weergave en de Waze-link ("" als onbekend). */
  address: string;
  customerEmail: string | null;
  confirmed: boolean;
  reservation: boolean;
  /** Resources of the todo (people/machines with their planned hours). */
  resources: TodoResourceDto[];
  /** Position among the blocks of the same todo, e.g. 2 of 3. */
  part: { index: number; total: number };
  /** Time of the todo that still has to be planned. */
  todoRemainingMinutes: number;
}

/** Waze-navigatielink naar een adres (tekstzoekopdracht). */
export function wazeUrl(address: string): string {
  return `https://waze.com/ul?q=${encodeURIComponent(address)}&navigate=yes`;
}
