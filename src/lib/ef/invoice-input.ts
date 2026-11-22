import type { EfInvoiceInput, EfInvoiceItem } from "./types";

/**
 * EF expects a language *name* ("dutch"), not an ISO code: "nl" is rejected
 * with 400 {"error":"language not valid"}. Verified against existing EF
 * invoices/quotes, which all carry language "dutch".
 */
export const EF_INVOICE_LANGUAGE = "dutch";

/** Builds the POST /invoices payload for a draft (concept) invoice. */
export function buildEfInvoiceInput(args: {
  clientId: number;
  date: string; // yyyy-MM-dd
  daysDue: number;
  items: EfInvoiceItem[];
}): EfInvoiceInput {
  return {
    client_id: args.clientId,
    status: "concept",
    date: args.date,
    days_due: args.daysDue,
    currency: "EUR",
    language: EF_INVOICE_LANGUAGE,
    tax_included: "no",
    items: args.items,
  };
}
