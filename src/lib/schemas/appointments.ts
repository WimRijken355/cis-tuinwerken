import { z } from "zod";

/** Contracten voor /api/appointments. */

export const appointmentInputSchema = z.object({
  todoId: z.number().int().positive(),
  /** ISO-tijdstip (met offset of UTC); de server bewaart UTC. */
  startAt: z.string().refine((v) => !Number.isNaN(Date.parse(v)), "Ongeldig tijdstip"),
  durationMinutes: z.number().int().min(15, "Minstens 15 minuten").max(24 * 60),
  note: z.string().max(2000).optional(),
});
export type AppointmentInput = z.infer<typeof appointmentInputSchema>;

export const appointmentUpdateSchema = appointmentInputSchema
  .omit({ todoId: true })
  .partial()
  .extend({
    status: z.enum(["PLANNED", "CANCELLED"]).optional(),
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
  customerId: number;
  customerName: string;
  /** Volledig adres voor weergave en de Waze-link ("" als onbekend). */
  address: string;
  customerEmail: string | null;
}

/** Waze-navigatielink naar een adres (tekstzoekopdracht). */
export function wazeUrl(address: string): string {
  return `https://waze.com/ul?q=${encodeURIComponent(address)}&navigate=yes`;
}
