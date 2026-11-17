import { z } from "zod";

/** Contracten voor terugkerend werk. */

const windowSchema = z
  .object({
    /** Bestaand window-id bij een update; weglaten = nieuw window. */
    id: z.number().int().positive().optional(),
    label: z.string().trim().min(1).max(50),
    startMonth: z.number().int().min(1).max(12),
    startDay: z.number().int().min(1).max(31).default(1),
    endMonth: z.number().int().min(1).max(12),
    endDay: z.number().int().min(1).max(31).default(31),
    sortOrder: z.number().int().default(0),
  })
  // endMonth < startMonth is toegestaan: het venster loopt over de jaargrens (bv. dec–jan).
  .refine((w) => w.startDay <= 31 && w.endDay <= 31, "Ongeldige dag");

export const recurringTemplateInputSchema = z.object({
  customerId: z.number().int().positive(),
  title: z.string().trim().min(1, "Titel is verplicht").max(200),
  description: z.string().max(5000).optional(),
  estimatedHours: z.coerce.number().positive().max(999),
  /** Zoveel dagen vóór het venster verschijnt de todo als "in te plannen". */
  leadTimeDays: z.coerce.number().int().min(0).max(365).default(30),
  active: z.boolean().default(true),
  windows: z.array(windowSchema).min(1, "Minstens één periode per jaar"),
});
export type RecurringTemplateInput = z.infer<typeof recurringTemplateInputSchema>;

export const recurringTemplateUpdateSchema = recurringTemplateInputSchema
  .omit({ customerId: true })
  .partial();
export type RecurringTemplateUpdate = z.infer<typeof recurringTemplateUpdateSchema>;

export interface RecurringWindowDto {
  id: number;
  label: string;
  startMonth: number;
  startDay: number;
  endMonth: number;
  endDay: number;
  sortOrder: number;
}

export interface RecurringTemplateDto {
  id: number;
  customerId: number;
  customerName?: string;
  title: string;
  description: string | null;
  estimatedHours: number;
  leadTimeDays: number;
  active: boolean;
  windows: RecurringWindowDto[];
}

export const MONTH_NAMES_NL = [
  "Jan", "Feb", "Mrt", "Apr", "Mei", "Jun",
  "Jul", "Aug", "Sep", "Okt", "Nov", "Dec",
] as const;

/** Automatisch label voor een venster: "Mei" of "Sep–Okt". */
export function windowLabel(startMonth: number, endMonth: number): string {
  return startMonth === endMonth
    ? MONTH_NAMES_NL[startMonth - 1]
    : `${MONTH_NAMES_NL[startMonth - 1]}–${MONTH_NAMES_NL[endMonth - 1]}`;
}
