import { z } from "zod";
import type { EfInvoiceItem } from "./ef/types";

/**
 * Editable structure of an invoice (pure, unit tested in invoice-content.test.ts).
 *
 * EenvoudigFactureren only knows a flat list of lines ("item" with an amount,
 * "text" without). Our structure keeps what belongs together:
 *   lines: priced lines, each with an optional remark (→ a text line right below)
 *   notes: free note lines (→ text lines at the bottom)
 * Invoice.contentJson stores this; Invoice.linesJson (the EF payload) is
 * always generated from it with itemsFromContent().
 */

export interface InvoiceContentLine {
  item: { description: string; quantity: number; unit: string; amount: number; tax_rate: number };
  remark?: string;
}

export interface InvoiceContent {
  lines: InvoiceContentLine[];
  notes: string[];
}

const round2 = (v: number) => Math.round(v * 100) / 100;

/** Belgian VAT rates an invoice line can have (the choices in the invoice editor). */
export const VAT_RATES = [0, 6, 12, 21] as const;
export type VatRate = (typeof VAT_RATES)[number];

export function isVatRate(v: number): v is VatRate {
  return (VAT_RATES as readonly number[]).includes(v);
}

/** The EF payload for a content structure. */
export function itemsFromContent(content: InvoiceContent): EfInvoiceItem[] {
  const items: EfInvoiceItem[] = [];
  for (const line of content.lines) {
    items.push({ type: "item", ...line.item });
    const remark = line.remark?.trim();
    if (remark) items.push({ type: "text", description: remark });
  }
  for (const note of content.notes) {
    if (note.trim()) items.push({ type: "text", description: note.trim() });
  }
  return items;
}

/** Total excl. VAT, computed in cents (no float drift). */
export function totalOfContent(content: InvoiceContent): number {
  const cents = content.lines.reduce(
    (sum, l) => sum + Math.round(round2(l.item.quantity) * Math.round(round2(l.item.amount) * 100)),
    0,
  );
  return cents / 100;
}

/**
 * Best-effort structure for invoices from before contentJson existed: a text
 * line right after a priced line is its remark; all other text lines are notes.
 * (Ambiguous by nature: a note right after the last priced line is read as a
 * remark of that line — it then still ends up on the same spot in EF.)
 */
export function contentFromItems(items: EfInvoiceItem[]): InvoiceContent {
  const content: InvoiceContent = { lines: [], notes: [] };
  let previous: "item" | "text" | null = null;
  for (const item of items) {
    if (item.type === "item") {
      content.lines.push({
        item: {
          description: item.description,
          quantity: Number(item.quantity ?? 0),
          unit: item.unit ?? "",
          amount: Number(item.amount ?? 0),
          tax_rate: Number(item.tax_rate ?? 21),
        },
      });
    } else {
      const last = content.lines.at(-1);
      if (previous === "item" && last && !last.remark) last.remark = item.description;
      else content.notes.push(item.description);
    }
    previous = item.type;
  }
  return content;
}

/** May the invoice still be edited? Only while it is not in EenvoudigFactureren. */
export function canEditInvoice(invoice: {
  efInvoiceId: number | null;
  pushStatus: "PENDING" | "CONCEPT_CREATED" | "FAILED" | "NOT_SYNCED";
}): boolean {
  return invoice.efInvoiceId === null && (invoice.pushStatus === "NOT_SYNCED" || invoice.pushStatus === "FAILED");
}

/** Contract for PATCH /api/invoices/:id (the whole content is replaced). */
export const invoiceContentSchema = z.object({
  lines: z
    .array(
      z.object({
        item: z.object({
          description: z.string().trim().min(1, "Omschrijving is verplicht").max(500),
          quantity: z.coerce
            .number()
            .positive("Aantal moet groter dan 0 zijn")
            .max(100000)
            .transform(round2),
          unit: z.string().trim().min(1, "Eenheid is verplicht").max(10, "Eenheid max 10 tekens (EF-limiet)"),
          amount: z.coerce.number().min(0, "Prijs kan niet negatief zijn").max(100000).transform(round2),
          tax_rate: z.coerce.number().refine(isVatRate, "Btw: 0, 6, 12 of 21"),
        }),
        remark: z
          .string()
          .trim()
          .max(500)
          .optional()
          .transform((v) => v || undefined),
      }),
    )
    .min(1, "Een factuur heeft minstens één regel")
    .max(200),
  notes: z
    .array(z.string().trim().max(1000))
    .max(20)
    .default([])
    .transform((list) => list.filter(Boolean)),
});

/** Content structure of a freshly built job invoice (buildJobInvoice result). */
export function contentFromBuilt(built: {
  lines: { item: EfInvoiceItem; remark?: string }[];
  notes: string[];
}): InvoiceContent {
  return {
    lines: built.lines.map((l) => ({
      item: {
        description: l.item.description,
        quantity: Number(l.item.quantity ?? 0),
        unit: l.item.unit ?? "",
        amount: Number(l.item.amount ?? 0),
        tax_rate: Number(l.item.tax_rate ?? 21),
      },
      ...(l.remark ? { remark: l.remark } : {}),
    })),
    notes: [...built.notes],
  };
}

export interface VatSummary {
  exclVat: number;
  /** Per VAT rate: the taxable base and the VAT on it (highest rate first). */
  perRate: { rate: number; base: number; vat: number }[];
  vat: number;
  inclVat: number;
}

/**
 * Totals excl./incl. VAT of a list of EF lines (text lines ignored). VAT is
 * computed per rate on the total of that rate (as on a Belgian invoice),
 * in cents. EenvoudigFactureren makes the official calculation; this is the
 * same method, for display.
 */
export function vatSummary(
  items: { type?: string; quantity?: number; amount?: number; tax_rate?: number }[],
): VatSummary {
  const baseCents = new Map<number, number>();
  for (const i of items) {
    if (i.type === "text") continue;
    const cents = Math.round(round2(Number(i.quantity ?? 0)) * Math.round(round2(Number(i.amount ?? 0)) * 100));
    const rate = Number(i.tax_rate ?? 0);
    baseCents.set(rate, (baseCents.get(rate) ?? 0) + cents);
  }
  const perRate = [...baseCents]
    .sort(([a], [b]) => b - a)
    .map(([rate, base]) => ({ rate, base: base / 100, vat: Math.round((base * rate) / 100) / 100 }));
  const exclCents = [...baseCents.values()].reduce((s, c) => s + c, 0);
  const vatCents = perRate.reduce((s, r) => s + Math.round(r.vat * 100), 0);
  return { exclVat: exclCents / 100, perRate, vat: vatCents / 100, inclVat: (exclCents + vatCents) / 100 };
}

/**
 * Content of a rebuilt job invoice (e.g. after changing the invoiced hours
 * from the todo's details) that keeps what was added by hand: the remark of a
 * line moves along with the line of the same description, remarks whose line
 * disappeared and the free notes stay as notes. Line amounts/quantities always
 * come from the rebuilt invoice.
 */
export function rebuildContentKeepingNotes(
  built: { lines: { item: EfInvoiceItem }[]; notes: string[] },
  previous: InvoiceContent,
): InvoiceContent {
  const fresh = contentFromBuilt(built);
  const remarkByDescription = new Map<string, string>();
  for (const line of previous.lines) {
    const remark = line.remark?.trim();
    if (remark) remarkByDescription.set(line.item.description, remark);
  }
  for (const line of fresh.lines) {
    const remark = remarkByDescription.get(line.item.description);
    if (remark) {
      line.remark = remark;
      remarkByDescription.delete(line.item.description);
    }
  }
  const notes = [...fresh.notes, ...remarkByDescription.values(), ...previous.notes];
  return { lines: fresh.lines, notes: [...new Set(notes.map((n) => n.trim()).filter(Boolean))] };
}
