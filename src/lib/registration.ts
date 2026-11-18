import { DateTime } from "luxon";
import type { EfInvoiceItem } from "./ef/types";
import { normalize } from "./planning";
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
 * Hours between two "HH:mm" clock times, per started quarter. Used to let
 * someone fill in "van/tot" per resource instead of a raw hours count.
 * A "tot" before or equal to "van" (typo, or a shift over midnight) yields 0
 * rather than a negative or wrapped value — the UI leaves it to be corrected.
 */
export function hoursFromTimeRange(from: string, to: string): number {
  const [fh, fm] = from.split(":").map(Number);
  const [th, tm] = to.split(":").map(Number);
  if (![fh, fm, th, tm].every(Number.isFinite)) return 0;
  return ceilToQuarterHour((th * 60 + tm - (fh * 60 + fm)) / 60);
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

export interface BuiltInvoiceLine {
  /**
   * Stable key of the line (same on client and server for the same data):
   * used to attach a remark to a line chosen in the preview.
   */
  key: string;
  kind: "labor" | "machine" | "extra";
  item: EfInvoiceItem;
  /** Remark shown as a text line right below the item (sent to EF). */
  remark?: string;
  /**
   * How the line is composed, for consultation only (NOT sent to EF):
   * e.g. "Werkuren op 07/12/2026" = Cis 8 u + Ken 7,5 u.
   */
  details: { name: string; hours: number }[];
}

export interface BuiltInvoice {
  /** Exactly what is sent to EenvoudigFactureren (items + remark/note text lines). */
  items: EfInvoiceItem[];
  /** The priced lines with their key and composition (for preview and detail views). */
  lines: BuiltInvoiceLine[];
  /** Free note lines added at the bottom of the invoice. */
  notes: string[];
  totalExclVat: number;
}

const round2 = (v: number) => Math.round(v * 100) / 100;
const dayKeyOf = (d: Date | string) =>
  (typeof d === "string" ? DateTime.fromISO(d) : DateTime.fromJSDate(d)).setZone(ZONE);

/**
 * Builds the EenvoudigFactureren lines of a job from all its registered days
 * that were not invoiced yet:
 * - per day "Werkuren op dd/MM/yyyy": the invoiced hours of all PEOPLE that
 *   day summed — one line per hourly rate (+VAT), so amounts stay exact when
 *   rates differ; the per-person split is kept in `details` (not sent to EF);
 * - per day and machine "<machine> op dd/MM/yyyy";
 * - extras (artikels) summed over the job per article/description/price/VAT/unit;
 * - lines with 0 invoiced hours / quantity are left out;
 * - `remarks` (by line key) become a text line right below their line;
 *   remarks for unknown keys are not lost but added as notes;
 * - `notes` become text lines at the bottom of the invoice.
 * EF limits enforced: quantity max 2 decimals, unit max 10 chars, VAT 0/6/12/21;
 * money in cents (no float drift in the total).
 */
export function buildJobInvoice(params: {
  days: RegisteredDay[];
  remarks?: Record<string, string>;
  notes?: string[];
}): BuiltInvoice {
  const lines: BuiltInvoiceLine[] = [];
  let totalCents = 0;

  function addLine(
    key: string,
    kind: BuiltInvoiceLine["kind"],
    description: string,
    quantity: number,
    unit: string,
    amount: number,
    taxRate: number,
    details: BuiltInvoiceLine["details"],
  ) {
    const qty = round2(quantity);
    const unitPrice = round2(amount);
    if (qty <= 0) return;
    if (unit.length > 10) throw new Error(`Eenheid "${unit}" is langer dan 10 tekens (limiet EenvoudigFactureren)`);
    if (![0, 6, 12, 21].includes(taxRate)) throw new Error(`Ongeldig btw-tarief: ${taxRate}`);
    lines.push({
      key,
      kind,
      item: { type: "item", description: description.slice(0, 500), quantity: qty, unit, amount: unitPrice, tax_rate: taxRate },
      details,
    });
    totalCents += Math.round(qty * Math.round(unitPrice * 100));
  }

  const sortedDays = [...params.days].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  // Per day: people summed per rate, then each machine.
  type Group = { description: string; kind: "labor" | "machine"; hours: number; rate: number; vat: number; details: Map<string, number> };
  const groups = new Map<string, Group>();
  for (const day of sortedDays) {
    const d = dayKeyOf(day.date);
    const iso = d.toISODate();
    const label = d.toFormat("dd/LL/yyyy");
    for (const l of day.labor) {
      if (l.invoicedHours <= 0) continue;
      const isMachine = l.type === "MACHINE";
      const key = isMachine
        ? `machine|${l.resourceId ?? l.name}|${iso}|${l.hourlyRate}|${l.vatRate}`
        : `labor|${iso}|${l.hourlyRate}|${l.vatRate}`;
      const group = groups.get(key) ?? {
        description: isMachine ? `${l.name} op ${label}` : `Werkuren op ${label}`,
        kind: isMachine ? ("machine" as const) : ("labor" as const),
        hours: 0,
        rate: l.hourlyRate,
        vat: l.vatRate,
        details: new Map<string, number>(),
      };
      group.hours += l.invoicedHours;
      group.details.set(l.name, (group.details.get(l.name) ?? 0) + l.invoicedHours);
      groups.set(key, group);
    }
  }
  for (const [key, g] of groups) {
    addLine(key, g.kind, g.description, g.hours, "uur", g.rate, g.vat, [...g.details].map(([name, hours]) => ({ name, hours })));
  }

  // Extras over the whole job, per article + description + price + VAT + unit
  // (an edited description becomes its own line).
  const extras = new Map<string, { extra: RegisteredExtra; quantity: number }>();
  for (const day of sortedDays) {
    for (const e of day.extras) {
      const key = `extra|${e.priceListItemId ?? ""}|${e.description}|${e.unitPrice}|${e.vatRate}|${e.unit}`;
      const entry = extras.get(key) ?? { extra: e, quantity: 0 };
      entry.quantity += e.quantity;
      extras.set(key, entry);
    }
  }
  for (const [key, { extra, quantity }] of extras) {
    addLine(key, "extra", extra.description, quantity, extra.unit, extra.unitPrice, extra.vatRate, []);
  }

  // Remarks below their line; remarks whose line no longer exists become notes.
  const remarks = Object.fromEntries(
    Object.entries(params.remarks ?? {})
      .map(([k, v]) => [k, v.trim()] as const)
      .filter(([, v]) => v !== ""),
  );
  const knownKeys = new Set(lines.map((l) => l.key));
  const notes = [
    ...Object.entries(remarks)
      .filter(([k]) => !knownKeys.has(k))
      .map(([, v]) => v),
    ...(params.notes ?? []).map((n) => n.trim()).filter(Boolean),
  ];

  const items: EfInvoiceItem[] = [];
  for (const line of lines) {
    line.remark = remarks[line.key];
    items.push(line.item);
    if (line.remark) items.push({ type: "text", description: line.remark.slice(0, 500) });
  }
  for (const note of notes) items.push({ type: "text", description: note.slice(0, 1000) });

  return { items, lines, notes, totalExclVat: totalCents / 100 };
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

// ---------------------------------------------------------------------------
// Articles step: search in the price list
// ---------------------------------------------------------------------------

/**
 * Articles to offer for the search text: unselected items whose name contains
 * all typed words (case/accent-insensitive), alphabetically, at most `limit`.
 * `more` tells whether results were cut off. Selected items are shown apart.
 */
export function searchArticles<T extends { id: number; name: string }>(
  items: T[],
  query: string,
  selectedIds: Set<number>,
  limit = 30,
): { results: T[]; more: boolean } {
  const words = normalize(query).split(/\s+/).filter(Boolean);
  const matches = items
    .filter((i) => !selectedIds.has(i.id))
    .filter((i) => words.every((w) => normalize(i.name).includes(w)))
    .sort((a, b) => a.name.localeCompare(b.name, "nl-BE"));
  return { results: matches.slice(0, limit), more: matches.length > limit };
}
