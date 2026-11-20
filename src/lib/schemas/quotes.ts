import { z } from "zod";

/** Contracts for quotes (offertes) mirrored from EenvoudigFactureren. */

export interface QuoteLineDto {
  id: number;
  description: string;
  quantity: number;
  unit: string;
  amount: number;
  taxRate: number;
  /** Todos this line is linked to. */
  linkedTodoIds: number[];
  /** Already charged on an invoice (through any todo). */
  invoiced: boolean;
}

export interface QuoteDto {
  id: number;
  efQuoteId: number;
  number: string;
  reference: string | null;
  date: string;
  status: string;
  statusLabel: string;
  /** open/accepted: its lines may be linked to a new todo. */
  linkable: boolean;
  totalExclVat: number;
  lines: QuoteLineDto[];
}

/** GET /api/customers/:id/quotes */
export interface CustomerQuotesResponse {
  /** false = customer not linked to EF (no quotes possible). */
  linkedToEf: boolean;
  quotes: QuoteDto[];
}

/** A quote line linked to a todo, as proposed in the invoice step. */
export interface TodoQuoteLineDto {
  /** TodoQuoteLine id (what the registration sends back to invoice it). */
  linkId: number;
  quoteLineId: number;
  quoteNumber: string;
  description: string;
  quantity: number;
  unit: string;
  amount: number;
  taxRate: number;
  /** Invoice it was charged on; null = still to invoice. */
  invoiceId: number | null;
}

/** Linked quote line ids on a todo (POST/PATCH /api/todos); replaces the set. */
export const quoteLineIdsSchema = z
  .array(z.number().int().positive())
  .max(200)
  .refine((ids) => new Set(ids).size === ids.length, "Een offertelijn kan maar één keer gekoppeld worden");
