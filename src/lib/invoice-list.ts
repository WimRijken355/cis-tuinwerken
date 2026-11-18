import type { InvoiceDto } from "./schemas/completions";
import { toBrussels } from "./time";

/**
 * Client-side filters of the invoices overview (Facturen). Pure logic so it can
 * be tested without the page.
 */

/** Status filter: an EF push status, "EXCLUDED" (= "niet versturen") or "" (all). */
export type InvoiceStatusFilter = "" | "CONCEPT_CREATED" | "FAILED" | "NOT_SYNCED" | "PENDING" | "EXCLUDED";

export interface InvoiceListFilter {
  /** Matches customer name, work title or error message (case-insensitive). */
  text: string;
  status: InvoiceStatusFilter;
  /** Work date range, inclusive, as yyyy-MM-dd (Brussels day); "" = open. */
  from: string;
  to: string;
}

export const EMPTY_INVOICE_FILTER: InvoiceListFilter = { text: "", status: "", from: "", to: "" };

export const INVOICE_STATUS_OPTIONS: { value: InvoiceStatusFilter; label: string }[] = [
  { value: "", label: "Alle statussen" },
  { value: "CONCEPT_CREATED", label: "In EF" },
  { value: "NOT_SYNCED", label: "Niet gesynchroniseerd" },
  { value: "FAILED", label: "Push mislukt" },
  { value: "PENDING", label: "Bezig" },
  { value: "EXCLUDED", label: "Niet versturen" },
];

type FilterableInvoice = Pick<
  InvoiceDto,
  "customerName" | "workTitle" | "errorMessage" | "pushStatus" | "syncExcluded" | "workDate"
>;

export function matchesInvoiceFilter(invoice: FilterableInvoice, filter: InvoiceListFilter): boolean {
  const text = filter.text.trim().toLowerCase();
  if (text) {
    const haystack = [invoice.customerName, invoice.workTitle, invoice.errorMessage ?? ""].join(" ").toLowerCase();
    if (!haystack.includes(text)) return false;
  }
  if (filter.status === "EXCLUDED") {
    if (!invoice.syncExcluded) return false;
  } else if (filter.status && invoice.pushStatus !== filter.status) {
    return false;
  }
  if (filter.from || filter.to) {
    const day = toBrussels(invoice.workDate).toFormat("yyyy-MM-dd");
    if (filter.from && day < filter.from) return false;
    if (filter.to && day > filter.to) return false;
  }
  return true;
}

export function filterInvoices<T extends FilterableInvoice>(invoices: T[], filter: InvoiceListFilter): T[] {
  return invoices.filter((i) => matchesInvoiceFilter(i, filter));
}

export function isInvoiceFilterActive(filter: InvoiceListFilter): boolean {
  return Boolean(filter.text.trim() || filter.status || filter.from || filter.to);
}
