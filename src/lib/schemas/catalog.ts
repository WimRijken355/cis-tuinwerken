import { z } from "zod";

/** Contracten voor medewerkers en de prijslijst. */

export const workerInputSchema = z.object({
  name: z.string().trim().min(1, "Naam is verplicht").max(100),
  hourlyRate: z.coerce.number().min(0).max(1000),
  active: z.boolean().default(true),
});
export type WorkerInput = z.infer<typeof workerInputSchema>;

export interface WorkerDto {
  id: number;
  name: string;
  hourlyRate: number;
  active: boolean;
}

export const priceListItemInputSchema = z.object({
  name: z.string().trim().min(1, "Naam is verplicht").max(200),
  /** Max 10 tekens — harde limiet van EenvoudigFactureren. */
  unit: z.string().trim().min(1, "Eenheid is verplicht").max(10, "Max 10 tekens (EF-limiet)"),
  unitPrice: z.coerce.number().min(0).max(100000),
  vatRate: z.coerce.number().refine((v) => [0, 6, 12, 21].includes(v), "Btw: 0, 6, 12 of 21"),
  active: z.boolean().default(true),
  sortOrder: z.coerce.number().int().default(0),
});
export type PriceListItemInput = z.infer<typeof priceListItemInputSchema>;

export interface PriceListItemDto {
  id: number;
  name: string;
  unit: string;
  unitPrice: number;
  vatRate: number;
  active: boolean;
  sortOrder: number;
}
