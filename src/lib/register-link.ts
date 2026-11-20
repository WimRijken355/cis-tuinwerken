import { WORKDAY_MINUTES } from "./planning";

/**
 * Links into the registration wizard (/daily-planning/:id/register), which is
 * opened from the Dagplanning and from the Todo's overview. Pure, unit tested.
 */

/** Where the wizard may send the user back to (internal pages only). */
const BACK_TARGETS = ["/daily-planning", "/todos"] as const;

/** Link to the wizard for a block; `back` = page to return to, `date` = Dagplanning day. */
export function registerHref(appointmentId: number, opts: { back?: string; date?: string } = {}): string {
  const params = new URLSearchParams();
  if (opts.date) params.set("date", opts.date);
  if (opts.back && opts.back !== "/daily-planning") params.set("back", opts.back);
  const query = params.toString();
  return `/daily-planning/${appointmentId}/register${query ? `?${query}` : ""}`;
}

/**
 * The wizard's "back" link from its query string: an allowed internal page
 * (never an external URL), otherwise the Dagplanning (of `date` if given).
 */
export function registerBackHref(params: { get(name: string): string | null }): string {
  const back = params.get("back");
  if (back && (BACK_TARGETS as readonly string[]).includes(back)) return back;
  const date = params.get("date");
  return `/daily-planning${date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? `?date=${date}` : ""}`;
}

/**
 * Length of the block created to register unplanned work (Todo's → "Klaarmelden
 * (vandaag)"): what is left of the todo's time, at least 1 hour and at most a
 * workday. The hours themselves are entered in the wizard anyway.
 */
export function adHocBlockMinutes(
  estimatedHours: number,
  blocks: { status: "PLANNED" | "DONE" | "CANCELLED" | string; durationMinutes: number }[],
): number {
  const used = blocks.filter((b) => b.status !== "CANCELLED").reduce((sum, b) => sum + b.durationMinutes, 0);
  const left = Math.round(estimatedHours * 60) - used;
  return Math.min(WORKDAY_MINUTES, Math.max(60, Math.ceil(left / 15) * 15));
}

/** Name of the page the wizard returns to, for its links ("← Dagplanning", "Naar Todo's"). */
export function registerBackLabel(backHref: string): string {
  return backHref.startsWith("/todos") ? "Todo's" : "Dagplanning";
}
