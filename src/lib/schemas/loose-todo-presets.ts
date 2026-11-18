import { z } from "zod";

/**
 * Contracts for the quick picks of a losse todo ("Vakantie",
 * "Doktersafspraak", ...), managed in Settings → Losse todo's.
 */

export const looseTodoPresetInputSchema = z.object({
  name: z.string().trim().min(1, "Naam is verplicht").max(100),
  active: z.boolean().default(true),
});

/** PATCH: all optional, no defaults (omitted fields stay unchanged). */
export const looseTodoPresetUpdateSchema = z.object({
  name: z.string().trim().min(1, "Naam is verplicht").max(100).optional(),
  active: z.boolean().optional(),
});

export interface LooseTodoPresetDto {
  id: number;
  name: string;
  active: boolean;
  sortOrder: number;
}
