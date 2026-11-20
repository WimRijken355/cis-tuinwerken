import { buildInvoice, selectQuoteLines } from "./registration";
import type { UninvoicedJobDto } from "./schemas/completions";

/** Pure helpers of the customer page "Factuur maken" dialog (customer-invoice-dialog.tsx). */

export interface CreatedInvoice {
  invoiceId: number;
  efPush?: { ok: boolean; skipped?: boolean; message?: string; error?: string };
}

/** What the "Factuur maken" result says to the user. */
export function customerInvoiceMessage(r: CreatedInvoice): string {
  if (r.efPush?.skipped) return `Factuur gemaakt. ${r.efPush.message ?? ""}`.trim();
  if (r.efPush?.ok) return "Factuur gemaakt en als concept naar EenvoudigFactureren gestuurd.";
  return `Factuur gemaakt, maar de push naar EenvoudigFactureren mislukte (${r.efPush?.error ?? "onbekende fout"}). Opnieuw versturen kan vanuit Facturen.`;
}

/** The invoice for the ticked jobs and quote lines (grouped per todo when several). */
export function previewCustomerInvoice(jobs: UninvoicedJobDto[], todoIds: Set<number>, quoteLinkIds: Set<number>) {
  return buildInvoice({
    jobs: jobs
      .filter((j) => todoIds.has(j.todoId))
      .map((j) => ({
        todoId: j.todoId,
        title: j.title,
        invoiceDescription: j.invoiceDescription,
        days: j.days,
        quoteLines: selectQuoteLines(j.quoteLines, quoteLinkIds),
      })),
  });
}

