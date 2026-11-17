import { z } from "zod";

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
  openTodoCount?: number;
}

/** Volledig adres als één string — ook gebruikt voor de Waze-link. */
export function formatAddress(c: Pick<CustomerDto, "street" | "postalCode" | "city">): string {
  const line1 = c.street?.trim();
  const line2 = [c.postalCode, c.city].filter(Boolean).join(" ").trim();
  return [line1, line2].filter(Boolean).join(", ");
}
