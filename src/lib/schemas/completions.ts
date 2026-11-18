import { z } from "zod";

/** Contract voor het afronden van een afspraak (urenregistratie + extra's). */

const hoursSchema = z.coerce
  .number()
  .positive("Uren moeten groter dan 0 zijn")
  .max(24, "Meer dan 24 uur op één dag kan niet")
  // EF accepteert max 2 decimalen op quantity.
  .transform((v) => Math.round(v * 100) / 100);

export const completionInputSchema = z.object({
  /** Eigen gewerkte uren (tarief komt uit Instellingen). */
  ownHours: hoursSchema,
  /** Meegebrachte werkmensen: naam + uren + tarief (vooringevuld uit de picklist). */
  workers: z
    .array(
      z.object({
        name: z.string().trim().min(1, "Naam is verplicht").max(100),
        hours: hoursSchema,
        hourlyRate: z.coerce.number().min(0).max(1000),
      }),
    )
    .default([]),
  /** Extra aanrekeningen (machines, afvoer, ...), snapshots van de prijslijst. */
  extras: z
    .array(
      z.object({
        priceListItemId: z.number().int().positive().optional(),
        description: z.string().trim().min(1).max(200),
        quantity: z.coerce
          .number()
          .positive()
          .max(10000)
          .transform((v) => Math.round(v * 100) / 100),
        unit: z.string().trim().min(1).max(10),
        unitPrice: z.coerce.number().min(0).max(100000),
        vatRate: z.coerce.number().refine((v) => [0, 6, 12, 21].includes(v)),
      }),
    )
    .default([]),
  note: z.string().max(2000).optional(),
});
export type CompletionInput = z.infer<typeof completionInputSchema>;

export interface InvoiceDto {
  id: number;
  customerId: number;
  customerName: string;
  efInvoiceId: number | null;
  pushStatus: "PENDING" | "CONCEPT_CREATED" | "FAILED" | "NOT_SYNCED";
  totalExclVat: number;
  errorMessage: string | null;
  createdAt: string;
  pushedAt: string | null;
  workTitle: string;
  workDate: string;
}
