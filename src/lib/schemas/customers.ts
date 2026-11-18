import { z } from "zod";
import type { Prisma } from "@/generated/prisma/client";
import { paginationQuerySchema, type Paginated } from "../pagination";

/** Contracten voor /api/customers. */

export const customerInputSchema = z.object({
  name: z.string().trim().min(1, "Naam is verplicht").max(200),
  email: z.union([z.literal(""), z.string().email("Ongeldig e-mailadres")]).optional(),
  phone: z.string().trim().max(50).optional(),
  street: z.string().trim().max(200).optional(),
  postalCode: z.string().trim().max(20).optional(),
  city: z.string().trim().max(100).optional(),
  countryCode: z.string().trim().length(2).default("BE"),
  vatNumber: z.string().trim().max(30).optional(),
  notes: z.string().max(5000).optional(),
  active: z.boolean().default(true),
});
export type CustomerInput = z.infer<typeof customerInputSchema>;

/** Zoals de API een klant teruggeeft. */
export interface CustomerDto {
  id: number;
  name: string;
  email: string | null;
  phone: string | null;
  street: string | null;
  postalCode: string | null;
  city: string | null;
  countryCode: string;
  vatNumber: string | null;
  efClientId: number | null;
  notes: string | null;
  active: boolean;
  /** Demo data customer (never synced to EF, never e-mailed). */
  isDemo?: boolean;
  openTodoCount?: number;
}

/** Volledig adres als één string — ook gebruikt voor de Waze-link. */
export function formatAddress(c: Pick<CustomerDto, "street" | "postalCode" | "city">): string {
  const line1 = c.street?.trim();
  const line2 = [c.postalCode, c.city].filter(Boolean).join(" ").trim();
  return [line1, line2].filter(Boolean).join(", ");
}

// ---------------------------------------------------------------------------
// Paginated list (GET /api/customers)
// ---------------------------------------------------------------------------

const optionalFilter = z
  .string()
  .trim()
  .max(200)
  .optional()
  .transform((v) => v || undefined);

/** Query for GET /api/customers: pagination + one "contains" filter per column. */
export const customerListQuerySchema = paginationQuerySchema.extend({
  name: optionalFilter,
  /** Matches the street. */
  address: optionalFilter,
  postalCode: optionalFilter,
  city: optionalFilter,
  includeInactive: z
    .enum(["0", "1"])
    .optional()
    .transform((v) => v === "1"),
});
export type CustomerListQuery = z.infer<typeof customerListQuerySchema>;

export type CustomerListResponse = Paginated<CustomerDto>;

const contains = (value: string) => ({ contains: value, mode: "insensitive" as const });

/** Prisma `where` for the customer list; all filters are combined with AND. */
export function buildCustomerWhere(q: CustomerListQuery): Prisma.CustomerWhereInput {
  return {
    ...(q.includeInactive ? {} : { active: true }),
    ...(q.name ? { name: contains(q.name) } : {}),
    ...(q.address ? { street: contains(q.address) } : {}),
    ...(q.postalCode ? { postalCode: { startsWith: q.postalCode, mode: "insensitive" as const } } : {}),
    ...(q.city ? { city: contains(q.city) } : {}),
  };
}
