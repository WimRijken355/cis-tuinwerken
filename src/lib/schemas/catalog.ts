import { z } from "zod";
import type { Prisma } from "@/generated/prisma/client";
import { paginationQuerySchema, type Paginated } from "../pagination";

/** Contracts for the price list ("Artikels"). Resources live in ./resources.ts. */

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

// ---------------------------------------------------------------------------
// Paginated price list ("Artikels" page)
// ---------------------------------------------------------------------------

export interface PriceListItemListDto extends PriceListItemDto {
  efStockItemId: number | null;
}

/**
 * Query for the paginated GET /api/price-list (only when `page` is given;
 * without it the endpoint keeps returning the plain array of active items).
 */
export const priceListQuerySchema = paginationQuerySchema.extend({
  name: z
    .string()
    .trim()
    .max(200)
    .optional()
    .transform((v) => v || undefined),
  // "" (the "Alle" option) must mean "no filter", not 0% — so map it to undefined
  // before coercing (z.coerce.number() would turn "" into 0).
  vatRate: z.preprocess(
    (v) => (v === "" || v === undefined ? undefined : v),
    z.coerce
      .number()
      .refine((v) => [0, 6, 12, 21].includes(v), "Btw: 0, 6, 12 of 21")
      .optional(),
  ),
  status: z.enum(["active", "inactive", "all"]).default("all"),
  source: z.enum(["ef", "manual", "all"]).default("all"),
});
export type PriceListQuery = z.infer<typeof priceListQuerySchema>;

export type PriceListResponse = Paginated<PriceListItemListDto>;

/** Prisma `where` for the paginated price list; all filters are combined with AND. */
export function buildPriceListWhere(q: PriceListQuery): Prisma.PriceListItemWhereInput {
  return {
    ...(q.name ? { name: { contains: q.name, mode: "insensitive" as const } } : {}),
    ...(q.vatRate !== undefined ? { vatRate: q.vatRate } : {}),
    ...(q.status === "active" ? { active: true } : q.status === "inactive" ? { active: false } : {}),
    ...(q.source === "ef"
      ? { efStockItemId: { not: null } }
      : q.source === "manual"
        ? { efStockItemId: null }
        : {}),
  };
}
