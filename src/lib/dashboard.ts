import { DateTime } from "luxon";
import { toBrussels, ZONE } from "./time";

/**
 * Dashboard "Uren per resource": pure logic (periods, buckets, aggregation,
 * planned-hours allocation, axis ticks, colors). The API route
 * (src/app/api/dashboard/hours) only loads data; the page only draws.
 */

export type DashboardPeriod = "week" | "month" | "year";
export type HoursMetric = "planned" | "registered" | "invoiced";

export const METRIC_LABELS: Record<HoursMetric, string> = {
  planned: "Geplande uren",
  registered: "Geregistreerde uren",
  invoiced: "Gefactureerde uren",
};

/** Labels of the metric switch. */
export const METRIC_SHORT_LABELS: Record<HoursMetric, string> = {
  planned: "Gepland",
  registered: "Geregistreerd",
  invoiced: "Gefactureerd",
};

/** Hours of one resource on one Brussels day ("yyyy-MM-dd"). */
export interface HoursEntry {
  resourceId: number;
  day: string;
  hours: number;
}

export interface Bucket {
  key: string;
  /** Short axis label. */
  label: string;
  /** Inclusive day range "yyyy-MM-dd". */
  from: string;
  to: string;
}

const day = (d: string) => DateTime.fromISO(d, { zone: ZONE });

/** Inclusive day range + title of the period that contains `anchor`. */
export function periodRange(period: DashboardPeriod, anchor: string): { from: string; to: string; title: string } {
  const a = day(anchor).setLocale("nl");
  if (period === "week") {
    const start = a.startOf("week");
    const end = start.plus({ days: 6 });
    return {
      from: start.toISODate()!,
      to: end.toISODate()!,
      title: `Week ${start.weekNumber} · ${start.toFormat("d LLL")} – ${end.toFormat("d LLL yyyy")}`,
    };
  }
  if (period === "month") {
    const start = a.startOf("month");
    const title = start.toFormat("LLLL yyyy");
    return { from: start.toISODate()!, to: start.endOf("month").toISODate()!, title: title[0].toUpperCase() + title.slice(1) };
  }
  const start = a.startOf("year");
  return { from: start.toISODate()!, to: start.endOf("year").toISODate()!, title: start.toFormat("yyyy") };
}

/** Anchor of the previous (-1) / next (+1) period. */
export function shiftPeriod(period: DashboardPeriod, anchor: string, direction: -1 | 1): string {
  const unit = period === "week" ? { weeks: direction } : period === "month" ? { months: direction } : { years: direction };
  return day(anchor).plus(unit).toISODate()!;
}

/**
 * Bars of a period: a week → its 7 days, a month → the (ISO) weeks that
 * overlap it, clipped to the month, a year → its 12 months.
 */
export function periodBuckets(period: DashboardPeriod, anchor: string): Bucket[] {
  const { from, to } = periodRange(period, anchor);
  const start = day(from).setLocale("nl");
  const end = day(to);
  if (period === "week") {
    return Array.from({ length: 7 }, (_, i) => {
      const d = start.plus({ days: i });
      const iso = d.toISODate()!;
      return { key: iso, label: d.toFormat("ccc d/M"), from: iso, to: iso };
    });
  }
  if (period === "month") {
    const buckets: Bucket[] = [];
    let weekStart = start.startOf("week");
    while (weekStart <= end) {
      const bFrom = DateTime.max(weekStart, start).toISODate()!;
      const bTo = DateTime.min(weekStart.plus({ days: 6 }), end).toISODate()!;
      buckets.push({ key: bFrom, label: `wk ${weekStart.weekNumber}`, from: bFrom, to: bTo });
      weekStart = weekStart.plus({ weeks: 1 });
    }
    return buckets;
  }
  return Array.from({ length: 12 }, (_, i) => {
    const m = start.plus({ months: i });
    return { key: m.toISODate()!, label: m.toFormat("LLL"), from: m.toISODate()!, to: m.endOf("month").toISODate()! };
  });
}

/** hours[bucketKey][resourceId], only for the given resources; every cell present (0 when empty). */
export function bucketHours(
  entries: HoursEntry[],
  buckets: Bucket[],
  resourceIds: number[],
): Record<string, Record<number, number>> {
  const result: Record<string, Record<number, number>> = {};
  for (const b of buckets) result[b.key] = Object.fromEntries(resourceIds.map((id) => [id, 0]));
  const wanted = new Set(resourceIds);
  for (const e of entries) {
    if (!wanted.has(e.resourceId)) continue;
    const bucket = buckets.find((b) => e.day >= b.from && e.day <= b.to);
    if (bucket) result[bucket.key][e.resourceId] = round2(result[bucket.key][e.resourceId] + e.hours);
  }
  return result;
}

/** Total per resource over all buckets. */
export function totalsPerResource(cells: Record<string, Record<number, number>>, resourceIds: number[]): Record<number, number> {
  const totals: Record<number, number> = Object.fromEntries(resourceIds.map((id) => [id, 0]));
  for (const row of Object.values(cells)) for (const id of resourceIds) totals[id] = round2(totals[id] + (row[id] ?? 0));
  return totals;
}

/**
 * Planned hours per resource per day. A todo's resources each have a number
 * of hours (TodoResource.hours); its blocks are walked chronologically and
 * every resource gets the block length, capped by what is still open for that
 * resource — the same rule as the hours proposal when registering
 * (proposeHours). Cancelled blocks must be filtered out by the caller.
 */
export function allocatePlannedHours(
  todos: {
    appointments: { startAt: Date | string; durationMinutes: number }[];
    resources: { resourceId: number; hours: number }[];
  }[],
): HoursEntry[] {
  const out: HoursEntry[] = [];
  for (const todo of todos) {
    const open = new Map(todo.resources.map((r) => [r.resourceId, r.hours]));
    const blocks = [...todo.appointments].sort(
      (a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime(),
    );
    for (const block of blocks) {
      const blockHours = block.durationMinutes / 60;
      const blockDay = toBrussels(block.startAt).toISODate()!;
      for (const [resourceId, left] of open) {
        const hours = round2(Math.min(blockHours, left));
        if (hours <= 0) continue;
        open.set(resourceId, round2(left - hours));
        out.push({ resourceId, day: blockDay, hours });
      }
    }
  }
  return out;
}

/** Axis ticks 0..niceMax with a 1/2/2.5/5 × 10ⁿ step (about `count` steps). */
export function niceTicks(max: number, count = 4): number[] {
  if (!(max > 0)) return [0, 1];
  const raw = max / count;
  const magnitude = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * magnitude).find((s) => s >= raw)!;
  const top = Math.ceil(max / step) * step;
  return Array.from({ length: Math.round(top / step) + 1 }, (_, i) => round2(i * step));
}

/**
 * Categorical series colors (validated reference palette, fixed order).
 * The color follows the resource (its position among ALL resources by id),
 * never the filter: hiding one resource does not repaint the others. Beyond
 * eight resources a neutral gray is used (the name is always in the legend).
 */
export const SERIES_COLORS = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4", "#008300", "#6250d6", "#e34948"];
export const OVERFLOW_COLOR = "#8a8985";

export function resourceColor(resourceId: number, allResourceIds: number[]): string {
  const index = [...allResourceIds].sort((a, b) => a - b).indexOf(resourceId);
  return index >= 0 && index < SERIES_COLORS.length ? SERIES_COLORS[index] : OVERFLOW_COLOR;
}

export function formatHours(hours: number): string {
  return `${hours.toLocaleString("nl-BE", { maximumFractionDigits: 2 })} u`;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Display order of the metrics (also the order of bars within a resource). */
export const METRIC_ORDER: HoursMetric[] = ["planned", "registered", "invoiced"];

/**
 * Multi-select of metrics: toggles one, keeps the fixed display order and
 * never leaves the selection empty (the last one cannot be switched off).
 */
export function toggleMetric(selected: HoursMetric[], metric: HoursMetric): HoursMetric[] {
  const next = selected.includes(metric) ? selected.filter((m) => m !== metric) : [...selected, metric];
  if (next.length === 0) return selected;
  return METRIC_ORDER.filter((m) => next.includes(m));
}
