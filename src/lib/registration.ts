import { DateTime } from "luxon";
import type { EfInvoiceItem } from "./ef/types";
import { ZONE } from "./time";

/**
 * Pure rules for registering worked hours (the mobile "klaarmelden" flow) and
 * building the invoice of a (possibly multi-day) job. No DB/network — unit
 * tested in registration.test.ts.
 */

/** "Per begonnen kwartier": 1,1 u → 1,25 u; 0 stays 0. */
export function ceilToQuarterHour(hours: number): number {
  if (!Number.isFinite(hours) || hours <= 0) return 0;
  // Round to 6 decimals first so 1.25 (from 1.2500000001 float noise) stays 1.25.
  return Math.ceil(Math.round(hours * 4 * 1e6) / 1e6) / 4;
}

/**
 * Proposed hours for a planned resource on today's block: the block length,
 * but never more than what is still open for that resource on the todo
 * (its planned hours minus what was registered on earlier days).
 */
export function proposeHours(input: {
  blockMinutes: number;
  resourceTodoHours: number;
  alreadyRegisteredHours: number;
}): number {
  const open = Math.max(0, input.resourceTodoHours - input.alreadyRegisteredHours);
  return ceilToQuarterHour(Math.min(input.blockMinutes / 60, open));
}

/**
 * "Nu factureren" is switched on for the last block of a job: no other
 * planned blocks and no unplanned time left. Otherwise hours are registered
 * and the invoice follows with the last block.
 */
export function defaultInvoiceNow(input: { otherPlannedBlocks: number; remainingUnplannedMinutes: number }): boolean {
  return input.otherPlannedBlocks === 0 && input.remainingUnplannedMinutes <= 0;
}

// ---------------------------------------------------------------------------
// Invoice of a job (one or more registered days)
// ---------------------------------------------------------------------------

export interface RegisteredLabor {
  /** Resource id; null for a legacy owner line. */
  resourceId: number | null;
  name: string;
  type: "PERSON" | "MACHINE";
  invoicedHours: number;
  hourlyRate: number;
  vatRate: number;
}

export interface RegisteredExtra {
  priceListItemId?: number | null;
  description: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  vatRate: number;
}

export interface RegisteredDay {
  date: Date | string;
  labor: RegisteredLabor[];
  extras: RegisteredExtra[];
}

export interface BuiltInvoice {
  items: EfInvoiceItem[];
  totalExclVat: number;
}

const round2 = (v: number) => Math.round(v * 100) / 100;
const dayLabel = (d: Date | string) =>
  (typeof d === "string" ? DateTime.fromISO(d) : DateTime.fromJSDate(d)).setZone(ZONE).toFormat("dd/LL");

/**
 * Builds the EenvoudigFactureren lines of a job from all its registered days
 * that were not invoiced yet:
 * - one line per resource (same resource, rate and VAT summed over the days),
 *   "Werkuren <naam> – <titel> (19/11, 20/11)" for people,
 *   "<machine> – <titel> (…)" for machines; quantity = invoiced hours;
 * - extras (artikels) summed per article/price/VAT/unit;
 * - lines with 0 invoiced hours / quantity are left out.
 * EF limits enforced: quantity max 2 decimals, unit max 10 chars, VAT 0/6/12/21;
 * money in cents (no float drift in the total).
 */
export function buildJobInvoice(params: { workTitle: string; days: RegisteredDay[] }): BuiltInvoice {
  const items: EfInvoiceItem[] = [];
  let totalCents = 0;

  function addItem(description: string, quantity: number, unit: string, amount: number, taxRate: number) {
    const qty = round2(quantity);
    const unitPrice = round2(amount);
    if (qty <= 0) return;
    if (unit.length > 10) throw new Error(`Eenheid "${unit}" is langer dan 10 tekens (limiet EenvoudigFactureren)`);
    if (![0, 6, 12, 21].includes(taxRate)) throw new Error(`Ongeldig btw-tarief: ${taxRate}`);
    items.push({ type: "item", description: description.slice(0, 500), quantity: qty, unit, amount: unitPrice, tax_rate: taxRate });
    totalCents += Math.round(qty * Math.round(unitPrice * 100));
  }

  const sortedDays = [...params.days].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  // Labor, grouped per resource + rate + VAT (keeps first-seen order).
  const labor = new Map<string, { line: RegisteredLabor; hours: number; dates: string[] }>();
  for (const day of sortedDays) {
    for (const l of day.labor) {
      if (l.invoicedHours <= 0) continue;
      const key = `${l.resourceId ?? `name:${l.name}`}|${l.hourlyRate}|${l.vatRate}`;
      const entry = labor.get(key) ?? { line: l, hours: 0, dates: [] };
      entry.hours += l.invoicedHours;
      const label = dayLabel(day.date);
      if (!entry.dates.includes(label)) entry.dates.push(label);
      labor.set(key, entry);
    }
  }
  for (const { line, hours, dates } of labor.values()) {
    const what = line.type === "MACHINE" ? `${line.name} – ${params.workTitle}` : `Werkuren ${line.name} – ${params.workTitle}`;
    addItem(`${what} (${dates.join(", ")})`, hours, "uur", line.hourlyRate, line.vatRate);
  }

  // Extras, grouped per article + price + VAT + unit.
  const extras = new Map<string, { extra: RegisteredExtra; quantity: number }>();
  for (const day of sortedDays) {
    for (const e of day.extras) {
      const key = `${e.priceListItemId ?? e.description}|${e.unitPrice}|${e.vatRate}|${e.unit}`;
      const entry = extras.get(key) ?? { extra: e, quantity: 0 };
      entry.quantity += e.quantity;
      extras.set(key, entry);
    }
  }
  for (const { extra, quantity } of extras.values()) {
    addItem(extra.description, quantity, extra.unit, extra.unitPrice, extra.vatRate);
  }

  return { items, totalExclVat: totalCents / 100 };
}

// ---------------------------------------------------------------------------
// Preferred period of a todo ("april 2027")
// ---------------------------------------------------------------------------

/**
 * "yyyy-MM" months → the todo's preferred window (first day of `from` to the
 * last day of `to`, or of `from` when `to` is empty). Dates as calendar days
 * (UTC midnight, like the @db.Date columns). Swapped months are put in order.
 */
export function periodToWindow(from: string, to?: string | null): { windowStart: Date; windowEnd: Date } {
  let start = DateTime.fromFormat(from, "yyyy-MM", { zone: "utc" });
  let end = to ? DateTime.fromFormat(to, "yyyy-MM", { zone: "utc" }) : start;
  if (!start.isValid) throw new Error(`Ongeldige maand: ${from}`);
  if (!end.isValid) end = start;
  if (end < start) [start, end] = [end, start];
  return { windowStart: start.startOf("month").toJSDate(), windowEnd: end.endOf("month").startOf("day").toJSDate() };
}

const MONTHS = ["jan", "feb", "mrt", "apr", "mei", "jun", "jul", "aug", "sep", "okt", "nov", "dec"];

/** "apr 2027", "apr–jun 2027" or "nov 2026–feb 2027"; null without window. */
export function windowLabel(start: Date | string | null, end: Date | string | null): string | null {
  if (!start) return null;
  const s = DateTime.fromJSDate(new Date(start), { zone: "utc" });
  const e = end ? DateTime.fromJSDate(new Date(end), { zone: "utc" }) : s;
  const m = (d: DateTime) => MONTHS[d.month - 1];
  if (s.year === e.year && s.month === e.month) return `${m(s)} ${s.year}`;
  if (s.year === e.year) return `${m(s)}–${m(e)} ${s.year}`;
  return `${m(s)} ${s.year}–${m(e)} ${e.year}`;
}
