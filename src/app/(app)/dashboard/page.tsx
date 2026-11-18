"use client";

import { useQueries } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import type { DashboardHoursResponse } from "@/app/api/dashboard/hours/route";
import { type ChartSeries, HoursChart, MetricSwatch } from "@/components/dashboard/hours-chart";
import { ErrorNote, PageHeader, Spinner } from "@/components/ui";
import { apiGet } from "@/lib/api-client";
import {
  bucketHours,
  type DashboardPeriod,
  formatHours,
  type HoursMetric,
  METRIC_LABELS,
  METRIC_ORDER,
  METRIC_SHORT_LABELS,
  periodBuckets,
  periodRange,
  resourceColor,
  shiftPeriod,
  toggleMetric,
  totalsPerResource,
} from "@/lib/dashboard";
import { todayBrussels } from "@/lib/time";

/**
 * Dashboard: hours per resource per period (week → days, month → weeks,
 * year → months) for planned, registered and/or invoiced hours (several at
 * once). Resources can be switched on/off; bars side by side or stacked.
 * Pure logic in src/lib/dashboard.ts.
 */

const PERIODS: { value: DashboardPeriod; label: string }[] = [
  { value: "week", label: "Week" },
  { value: "month", label: "Maand" },
  { value: "year", label: "Jaar" },
];
const HIDDEN_KEY = "dashboard.hiddenResources";

const METRIC_NOTES: Record<HoursMetric, string> = {
  planned:
    "Gepland = niet-geannuleerde blokken; per resource telt de bloklengte, begrensd door de uren die voor die resource op de todo voorzien zijn.",
  registered: "Geregistreerd = de echt gewerkte uren bij het klaarmelden, op de dag van het blok.",
  invoiced: "Gefactureerd = de uren die bij het klaarmelden naar de factuur gingen, op de dag van het blok.",
};

function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
  label: string;
}) {
  return (
    <div role="group" aria-label={label} className="inline-flex rounded-md border border-gray-300 bg-white p-0.5 text-sm">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          aria-pressed={value === o.value}
          onClick={() => onChange(o.value)}
          className={`rounded px-3 py-1.5 ${value === o.value ? "bg-brand-600 text-white" : "text-gray-700 hover:bg-gray-50"}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export default function DashboardPage() {
  const [metrics, setMetrics] = useState<HoursMetric[]>(["planned"]);
  const [period, setPeriod] = useState<DashboardPeriod>("month");
  const [anchor, setAnchor] = useState(todayBrussels());
  const [mode, setMode] = useState<"grouped" | "stacked">("grouped");
  const [includeLoose, setIncludeLoose] = useState(false);
  // Remembered per browser (a viewer convenience only).
  const [hidden, setHidden] = useState<Set<number>>(new Set());
  useEffect(() => {
    try {
      const stored = JSON.parse(localStorage.getItem(HIDDEN_KEY) ?? "[]");
      if (Array.isArray(stored)) setHidden(new Set(stored.filter((n) => typeof n === "number")));
    } catch {
      /* no storage: all visible */
    }
  }, []);
  const toggleResource = (id: number) =>
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      try {
        localStorage.setItem(HIDDEN_KEY, JSON.stringify([...next]));
      } catch {
        /* ignore */
      }
      return next;
    });

  const range = periodRange(period, anchor);
  const buckets = useMemo(() => periodBuckets(period, anchor), [period, anchor]);

  const results = useQueries({
    queries: metrics.map((metric) => {
      const loose = metric === "planned" && includeLoose ? "1" : "0";
      return {
        queryKey: ["dashboard-hours", metric, range.from, range.to, loose],
        queryFn: () =>
          apiGet<DashboardHoursResponse>(
            `/api/dashboard/hours?metric=${metric}&from=${range.from}&to=${range.to}&loose=${loose}`,
          ),
        placeholderData: (prev: DashboardHoursResponse | undefined) => prev,
      };
    }),
  });
  const byMetric = Object.fromEntries(metrics.map((m, i) => [m, results[i]?.data])) as Partial<
    Record<HoursMetric, DashboardHoursResponse>
  >;
  const error = results.find((r) => r.error)?.error;
  const loaded = metrics.every((m) => byMetric[m]);

  const resources = results.find((r) => r.data)?.data?.resources ?? [];
  const allIds = resources.map((r) => r.id);
  const withHours = new Set(metrics.flatMap((m) => (byMetric[m]?.entries ?? []).map((e) => e.resourceId)));
  // Chips: active resources + any (inactive) resource that has hours in this period.
  const chipResources = resources.filter((r) => r.active || withHours.has(r.id));
  const series: ChartSeries[] = chipResources
    .filter((r) => !hidden.has(r.id))
    .map((r) => ({ id: r.id, name: r.name, color: resourceColor(r.id, allIds) }));
  const seriesIds = series.map((s) => s.id);
  const cells = Object.fromEntries(
    metrics.map((m) => [m, bucketHours(byMetric[m]?.entries ?? [], buckets, seriesIds)]),
  ) as Record<HoursMetric, Record<string, Record<number, number>>>;
  const totals = Object.fromEntries(metrics.map((m) => [m, totalsPerResource(cells[m], seriesIds)])) as Record<
    HoursMetric,
    Record<number, number>
  >;
  const grandTotal = (m: HoursMetric) => seriesIds.reduce((sum, id) => sum + totals[m][id], 0);

  return (
    <div className="p-4 md:p-8">
      <PageHeader title="Dashboard" />

      {/* filters: one row above the chart */}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div role="group" aria-label="Soort uren (meerdere mogelijk)" className="inline-flex gap-1 rounded-md border border-gray-300 bg-white p-0.5 text-sm">
          {METRIC_ORDER.map((m) => {
            const on = metrics.includes(m);
            return (
              <button
                key={m}
                type="button"
                aria-pressed={on}
                onClick={() => setMetrics((prev) => toggleMetric(prev, m))}
                title={on && metrics.length === 1 ? "Minstens één soort blijft aan" : undefined}
                className={`flex items-center gap-1.5 rounded px-3 py-1.5 ${on ? "bg-brand-600 text-white" : "text-gray-700 hover:bg-gray-50"}`}
              >
                <span aria-hidden>{on ? "☑" : "☐"}</span>
                {METRIC_SHORT_LABELS[m]}
              </button>
            );
          })}
        </div>
        <Segmented label="Periode" value={period} onChange={setPeriod} options={PERIODS} />
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setAnchor(shiftPeriod(period, anchor, -1))}
            className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm hover:bg-gray-50"
            aria-label="Vorige periode"
          >
            ‹
          </button>
          <span className="min-w-44 text-center text-sm font-medium">{range.title}</span>
          <button
            type="button"
            onClick={() => setAnchor(shiftPeriod(period, anchor, 1))}
            className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm hover:bg-gray-50"
            aria-label="Volgende periode"
          >
            ›
          </button>
          <button
            type="button"
            onClick={() => setAnchor(todayBrussels())}
            className="ml-1 rounded-md px-2 py-1.5 text-sm text-brand-600 hover:underline"
          >
            Vandaag
          </button>
        </div>
        <Segmented
          label="Weergave"
          value={mode}
          onChange={setMode}
          options={[
            { value: "grouped", label: "Naast elkaar" },
            { value: "stacked", label: "Gestapeld" },
          ]}
        />
        {metrics.includes("planned") && (
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input type="checkbox" checked={includeLoose} onChange={(e) => setIncludeLoose(e.target.checked)} />
            Losse todo&apos;s meetellen
          </label>
        )}
      </div>

      {/* resource toggles = legend */}
      <div className="mb-3 flex flex-wrap items-center gap-2" aria-label="Resources tonen">
        {chipResources.map((r) => {
          const on = !hidden.has(r.id);
          const color = resourceColor(r.id, allIds);
          return (
            <button
              key={r.id}
              type="button"
              aria-pressed={on}
              onClick={() => toggleResource(r.id)}
              className={`flex items-center gap-2 rounded-full border px-3 py-1 text-sm ${
                on ? "border-gray-300 bg-white text-gray-800" : "border-dashed border-gray-300 bg-gray-50 text-gray-400"
              }`}
              title={on ? "Verbergen" : "Tonen"}
            >
              <span
                className="inline-block h-3 w-3 rounded-sm"
                style={{ background: on ? color : "transparent", border: `2px solid ${color}` }}
              />
              {r.name}
              {r.type === "MACHINE" && <span className="text-xs text-gray-400">machine</span>}
            </button>
          );
        })}
        {metrics.length > 1 && (
          <span className="ml-2 flex flex-wrap items-center gap-3 text-xs text-gray-600" aria-label="Legende soort uren">
            {metrics.map((m) => (
              <span key={m} className="flex items-center gap-1">
                <MetricSwatch metric={m} />
                {METRIC_SHORT_LABELS[m]}
              </span>
            ))}
          </span>
        )}
      </div>

      {error && <ErrorNote message={(error as Error).message} />}
      {!loaded && !error && <Spinner />}

      {loaded && (
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="font-semibold">
              {metrics.length === 1 ? METRIC_LABELS[metrics[0]] : metrics.map((m) => METRIC_SHORT_LABELS[m]).join(" · ")}{" "}
              <span className="font-normal text-gray-500">
                per resource · per {period === "week" ? "dag" : period === "month" ? "week" : "maand"}
              </span>
            </h2>
            <p className="flex flex-wrap gap-4 text-sm text-gray-600">
              {metrics.map((m) => (
                <span key={m}>
                  {metrics.length > 1 ? METRIC_SHORT_LABELS[m] : "Totaal"}:{" "}
                  <span className="font-medium tabular-nums text-gray-900">{formatHours(grandTotal(m))}</span>
                </span>
              ))}
            </p>
          </div>
          {series.length === 0 ? (
            <p className="py-10 text-center text-sm text-gray-500">Zet minstens één resource aan.</p>
          ) : (
            <HoursChart buckets={buckets} series={series} metrics={metrics} cells={cells} mode={mode} />
          )}

          {series.length > 0 && (
            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-xs text-gray-500">
                  <tr className="border-b border-gray-200">
                    <th className="py-1.5 pr-3 font-medium">Resource</th>
                    {metrics.length > 1 && <th className="py-1.5 pr-3 font-medium">Soort</th>}
                    {buckets.map((b) => (
                      <th key={b.key} className="px-2 py-1.5 text-right font-medium">
                        {b.label}
                      </th>
                    ))}
                    <th className="py-1.5 pl-3 text-right font-medium">Totaal</th>
                  </tr>
                </thead>
                <tbody className="tabular-nums">
                  {series.flatMap((s) =>
                    metrics.map((m, mi) => (
                      <tr
                        key={`${s.id}-${m}`}
                        className={mi === metrics.length - 1 ? "border-b border-gray-200" : "border-b border-gray-50"}
                      >
                        <td className="whitespace-nowrap py-1.5 pr-3">
                          {mi === 0 && (
                            <>
                              <span className="mr-2 inline-block h-2.5 w-2.5 rounded-sm" style={{ background: s.color }} />
                              {s.name}
                            </>
                          )}
                        </td>
                        {metrics.length > 1 && (
                          <td className="whitespace-nowrap py-1.5 pr-3 text-gray-600">
                            <MetricSwatch metric={m} color={s.color} /> {METRIC_SHORT_LABELS[m]}
                          </td>
                        )}
                        {buckets.map((b) => (
                          <td key={b.key} className="px-2 py-1.5 text-right text-gray-700">
                            {cells[m][b.key][s.id] ? cells[m][b.key][s.id].toLocaleString("nl-BE") : "–"}
                          </td>
                        ))}
                        <td className="py-1.5 pl-3 text-right font-medium">{formatHours(totals[m][s.id])}</td>
                      </tr>
                    )),
                  )}
                </tbody>
              </table>
            </div>
          )}
          <div className="mt-3 space-y-0.5 text-xs text-gray-400">
            {metrics.map((m) => (
              <p key={m}>{METRIC_NOTES[m]}</p>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
