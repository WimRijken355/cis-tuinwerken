import { VAT_RATES } from "../invoice-content";

/**
 * Quotes (offertes) from EenvoudigFactureren: mapping of the API payload to
 * our mirror tables, and the pure decisions of a sync. No database or network
 * here (see services/quotes.ts for that).
 *
 * Observed API shape (GET /quotes, verified against the live API): money
 * fields are strings ("45.00"), quantity/tax_rate numbers, status one of
 * open | accepted | expired | rejected. Filtering per client works with
 * `filter=client_id=<id>` (no spaces).
 */

export interface EfQuoteItem {
  item_id: number;
  type?: "item" | "text" | string;
  description?: string | null;
  amount?: string | number | null;
  quantity?: number | string | null;
  unit?: string | null;
  discount_percentage?: number | string | null;
  total_without_tax?: string | number | null;
  tax_rate?: number | string | null;
}

export interface EfQuote {
  quote_id: number;
  client_id: number;
  number?: string | null;
  reference?: string | null;
  date?: string | null;
  status?: string | null;
  total_without_tax?: string | number | null;
  items?: EfQuoteItem[] | null;
}

/** Quote statuses whose lines can be linked to a new todo. */
export const LINKABLE_QUOTE_STATUSES = ["open", "accepted"] as const;

export const QUOTE_STATUS_LABELS: Record<string, string> = {
  open: "Open",
  accepted: "Aanvaard",
  expired: "Vervallen",
  rejected: "Geweigerd",
};

export interface MappedQuoteLine {
  efItemId: number;
  sortOrder: number;
  description: string;
  quantity: number;
  unit: string;
  amount: number;
  taxRate: number;
}

export interface MappedQuote {
  efQuoteId: number;
  efClientId: number;
  number: string;
  reference: string | null;
  date: Date;
  status: string;
  totalExclVat: number;
  lines: MappedQuoteLine[];
}

const round2 = (v: number) => Math.round(v * 100) / 100;
const toNumber = (v: unknown): number => {
  const n = typeof v === "number" ? v : Number(String(v ?? "").replace(",", "."));
  return Number.isFinite(n) ? n : 0;
};

/**
 * EF quote → our mirror. Only priced lines are kept (text lines dropped, as
 * well as lines with quantity 0 or a VAT rate we cannot invoice). The unit
 * price is net of the line discount; the unit is cut to EF's 10 characters.
 */
export function mapEfQuote(q: EfQuote): MappedQuote {
  const lines: MappedQuoteLine[] = [];
  for (const [index, item] of (q.items ?? []).entries()) {
    if (item.type === "text") continue;
    const quantity = round2(toNumber(item.quantity));
    const taxRate = toNumber(item.tax_rate);
    if (quantity <= 0 || !(VAT_RATES as readonly number[]).includes(taxRate)) continue;
    const discount = toNumber(item.discount_percentage);
    const listPrice = toNumber(item.amount);
    // With a discount, derive the net unit price from EF's own line total.
    const amount =
      discount > 0 && item.total_without_tax != null
        ? round2(toNumber(item.total_without_tax) / quantity)
        : round2(listPrice * (1 - discount / 100));
    lines.push({
      efItemId: item.item_id,
      sortOrder: index,
      description: (item.description ?? "").trim().slice(0, 500) || "Offertelijn",
      quantity,
      unit: (item.unit ?? "").trim().slice(0, 10) || "stuk",
      amount,
      taxRate,
    });
  }
  return {
    efQuoteId: q.quote_id,
    efClientId: q.client_id,
    number: (q.number ?? "").trim() || String(q.quote_id),
    reference: q.reference?.trim() || null,
    date: q.date ? new Date(`${q.date.slice(0, 10)}T00:00:00Z`) : new Date(0),
    status: (q.status ?? "open").toLowerCase(),
    totalExclVat: round2(toNumber(q.total_without_tax)),
    lines,
  };
}

/**
 * What a sync removes locally. Lines (and quotes) that disappeared from EF
 * are deleted, except when linked to a todo: those stay, so a todo never
 * loses a line it is going to invoice.
 */
export function planQuoteCleanup(params: {
  /** Local quotes in the sync's scope, with their lines and whether each is linked. */
  local: { efQuoteId: number; lines: { efItemId: number; linked: boolean }[] }[];
  /** What EF returned for that scope. */
  remote: { efQuoteId: number; lines: { efItemId: number }[] }[];
}): { deleteLineItemIds: number[]; deleteQuoteIds: number[] } {
  const remoteQuotes = new Map(params.remote.map((q) => [q.efQuoteId, new Set(q.lines.map((l) => l.efItemId))]));
  const deleteLineItemIds: number[] = [];
  const deleteQuoteIds: number[] = [];
  for (const quote of params.local) {
    const remoteLines = remoteQuotes.get(quote.efQuoteId);
    const gone = quote.lines.filter((l) => !remoteLines?.has(l.efItemId));
    const removable = gone.filter((l) => !l.linked);
    deleteLineItemIds.push(...removable.map((l) => l.efItemId));
    if (!remoteLines && removable.length === gone.length) deleteQuoteIds.push(quote.efQuoteId);
  }
  return { deleteLineItemIds, deleteQuoteIds };
}

/**
 * Quote line ids that may be linked to a todo of this customer: lines of the
 * customer's own quotes. Ids already linked to the todo stay allowed (also
 * when their quote has expired since).
 */
export function invalidQuoteLineIds(
  requested: number[],
  allowedForCustomer: Set<number>,
  alreadyLinked: Set<number> = new Set(),
): number[] {
  return requested.filter((id) => !allowedForCustomer.has(id) && !alreadyLinked.has(id));
}
