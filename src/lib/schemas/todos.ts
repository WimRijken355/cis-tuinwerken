import { z } from "zod";

/** Contracten voor /api/todos. */

export const todoInputSchema = z.object({
  customerId: z.number().int().positive(),
  title: z.string().trim().min(1, "Titel is verplicht").max(200),
  description: z.string().max(5000).optional(),
  estimatedHours: z.coerce
    .number()
    .positive("Geschatte uren moeten groter dan 0 zijn")
    .max(999, "Geschatte uren zijn onrealistisch hoog"),
});
export type TodoInput = z.infer<typeof todoInputSchema>;

export const todoUpdateSchema = todoInputSchema
  .omit({ customerId: true })
  .partial()
  .extend({
    status: z.enum(["OPEN", "PLANNED", "DONE", "CANCELLED"]).optional(),
  });
export type TodoUpdate = z.infer<typeof todoUpdateSchema>;

export interface TodoDto {
  id: number;
  customerId: number;
  customerName?: string;
  title: string;
  description: string | null;
  /** Als number geserialiseerd (Prisma Decimal → number in de API-laag). */
  estimatedHours: number;
  status: "OPEN" | "PLANNED" | "DONE" | "CANCELLED";
  completedAt: string | null;
  /** Gezet voor todo's die uit terugkerend werk gegenereerd zijn. */
  recurringWindowId: number | null;
  windowStart: string | null;
  windowEnd: string | null;
  windowLabel?: string | null;
}
