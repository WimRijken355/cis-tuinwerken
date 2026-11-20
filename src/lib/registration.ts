import { DateTime } from "luxon";
import type { EfInvoiceItem } from "./ef/types";
import { normalize } from "./planning";
import type { TodoResourceDto, TodoTaskDto } from "./schemas/todos";
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

/**
 * What a registration does with the job:
 * - "invoice": close the job and invoice every not yet invoiced day;
 * - "close": the job is finished but not invoiced (now) — todo DONE, the
 *   remaining planned blocks are cancelled, the days stay uninvoiced (they can
 *   still be invoiced later from the todo's details);
 * - "continue": an intermediate day — the todo stays open for the next block.
 * Invoicing always closes the job; `closeJob` missing = follow `invoiceNow`
 * (older clients). A project todo (`isProject`) never gets an invoice here.
 */
export type JobOutcome = "invoice" | "close" | "continue";

export function jobOutcome(invoiceNow: boolean, closeJob: boolean | undefined, isProject = false): JobOutcome {
  // A project is invoiced directly in EF: asking to invoice only closes the job.
  if (invoiceNow) return isProject ? "close" : "invoice";
  return closeJob ? "close" : "continue";
}

/**
 * May a job be closed afterwards from the todo's details (POST
 * /api/todos/:id/close), with (`invoice`) or without invoicing its open days?
 * Only once work was registered and nothing is planned any more; invoicing
 * needs a customer and at least one day not invoiced yet (this also allows
 * invoicing a job that was closed earlier without invoice).
 */
export function closeJobCheck(
  todo: {
    status: "OPEN" | "PLANNED" | "DONE" | "CANCELLED";
    hasCustomer: boolean;
    /** Project: invoiced directly in EF, never from this app. */
    isProject?: boolean;
    plannedBlocks: number;
    registeredDays: number;
    uninvoicedDays: number;
    /** Something on the uninvoiced days to charge (invoiced hours > 0 or articles). */
    hasBillable: boolean;
  },
  invoice: boolean,
): { allowed: true } | { allowed: false; reason: string } {
  if (todo.status === "CANCELLED") return { allowed: false, reason: "Deze todo is geannuleerd." };
  if (todo.plannedBlocks > 0) {
    return { allowed: false, reason: "Er staan nog geplande blokken: meld die eerst klaar of haal ze uit de planning." };
  }
  if (todo.registeredDays === 0) return { allowed: false, reason: "Er is nog geen werk geregistreerd." };
  if (invoice) {
    if (!todo.hasCustomer) return { allowed: false, reason: "Een losse todo wordt nooit gefactureerd." };
    if (todo.isProject) {
      return { allowed: false, reason: "Een project wordt rechtstreeks in EenvoudigFactureren gefactureerd." };
    }
    if (todo.uninvoicedDays === 0) return { allowed: false, reason: "Alle geregistreerde dagen zijn al gefactureerd." };
    if (!todo.hasBillable) {
      return { allowed: false, reason: "Er is niets te factureren: 0 gefactureerde uren en geen artikels." };
    }
    return { allowed: true };
  }
  if (todo.status === "DONE") return { allowed: false, reason: "Deze todo is al afgesloten." };
  return { allowed: true };
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
  kind: "labor" | "machine" | "extra" | "quote";
  item: EfInvoiceItem;
  /** Remark shown as a text line right below the item (sent to EF). */
  remark?: string;
  /**
   * How the line is composed, for consultation only (NOT sent to EF):
   * e.g. "Werkuren op 07/12/2026" = Cis 8 u + Ken 7,5 u.
   */
  details: { name: string; hours: number }[];
}

/**
 * Quote lines to invoice now: the ticked ones that are not on an invoice yet,
 * in their original order.
 */
export function selectQuoteLines<T extends { linkId: number; invoiceId: number | null }>(lines: T[], ticked: Set<number>): T[] {
  return lines.filter((l) => l.invoiceId === null && ticked.has(l.linkId));
}

/** Adds the id when absent, removes it when present (new Set, for React state). */
export function toggleId(ids: Set<number>, id: number): Set<number> {
  const next = new Set(ids);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  return next;
}

/** A quote line linked to the job (TodoQuoteLine), to put on the invoice. */
export interface InvoiceQuoteLine {
  linkId: number;
  description: string;
  quantity: number;
  unit: string;
  amount: number;
  taxRate: number;
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
 * - the chosen quote lines (EF offertes), one line each, as offered;
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
  /** Quote lines (EF offertes) of the job chosen to invoice now; key "quote|<linkId>". */
  quoteLines?: InvoiceQuoteLine[];
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

  // Quote lines as they were offered (after the registered work).
  for (const q of params.quoteLines ?? []) {
    addLine(`quote|${q.linkId}`, "quote", q.description, q.quantity, q.unit.slice(0, 10), q.amount, q.taxRate, []);
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

/**
 * "apr 2027", "apr–jun 2027" or "nov 2026–feb 2027" for whole months; with
 * specific days "12–18 mei 2027" (weekly/monthly recurrence). Null without window.
 */
export function windowLabel(start: Date | string | null, end: Date | string | null): string | null {
  if (!start) return null;
  const s = DateTime.fromJSDate(new Date(start), { zone: "utc" });
  const e = end ? DateTime.fromJSDate(new Date(end), { zone: "utc" }) : s;
  const m = (d: DateTime) => MONTHS[d.month - 1];
  // Whole months (yearly periods, preferred months): "apr 2027", "apr–jun 2027".
  const wholeMonths = s.day === 1 && e.day === e.daysInMonth;
  if (wholeMonths) {
    if (s.year === e.year && s.month === e.month) return `${m(s)} ${s.year}`;
    if (s.year === e.year) return `${m(s)}–${m(e)} ${s.year}`;
    return `${m(s)} ${s.year}–${m(e)} ${e.year}`;
  }
  // Specific days (weekly/monthly recurrence): "12 mei 2027", "12–18 mei 2027", "28 apr–4 mei 2027".
  if (s.hasSame(e, "day")) return `${s.day} ${m(s)} ${s.year}`;
  if (s.year === e.year && s.month === e.month) return `${s.day}–${e.day} ${m(s)} ${s.year}`;
  if (s.year === e.year) return `${s.day} ${m(s)}–${e.day} ${m(e)} ${s.year}`;
  return `${s.day} ${m(s)} ${s.year}–${e.day} ${m(e)} ${e.year}`;
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

/**
 * Proposal for the follow-up todo at the end of a registration ("Nieuwe todo
 * voor …?"): the same work again — title, total time, resources with their
 * hours, and the checklist (planned tasks plus the extra tasks done this
 * time, each once, all unticked). Free-text tasks without checklist item are
 * left out (the checklist picker only knows checklist items).
 */
export function followUpTodoInitial(todo: {
  title: string;
  estimatedHours: number;
  resources: TodoResourceDto[];
  tasks: TodoTaskDto[];
}): { title: string; estimatedHours: number; resources: TodoResourceDto[]; tasks: TodoTaskDto[] } {
  const seen = new Set<number>();
  const tasks = todo.tasks.filter((t) => {
    if (t.checklistItemId === null || seen.has(t.checklistItemId)) return false;
    seen.add(t.checklistItemId);
    return true;
  });
  return {
    title: todo.title,
    estimatedHours: todo.estimatedHours,
    resources: todo.resources.map((r) => ({ ...r })),
    tasks: tasks.map((t) => ({ ...t, done: false, unplanned: false })),
  };
}
