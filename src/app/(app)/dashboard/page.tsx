"use client";

import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import type { DashboardHoursResponse } from "@/app/api/dashboard/hours/route";
import { type ChartSeries, HoursChart } from "@/components/dashboard/hours-chart";
import { ErrorNote, PageHeader, Spinner } from "@/components/ui";
import { apiGet } from "@/lib/api-client";
import {
  bucketHours,
  type DashboardPeriod,
  formatHours,
  type HoursMetric,
  METRIC_LABELS,
  METRIC_SHORT_LABELS,
  periodBuckets,
  periodRange,
  resourceColor,
  shiftPeriod,
  totalsPerResource,
} from "@/lib/dashboard";
import { todayBrussels } from "@/lib/time";

/**
 * Dashboard: hours per resource per period (week → days, month → weeks,
 * year → months) for planned, registered or invoiced hours. Resources can be
 * switched on/off; bars side by side or stacked. Pure logic in src/lib/dashboard.ts.
 */

const PERIODS: { value: DashboardPeriod; label: string }[] = [
  { value: "week", label: "Week" },
  { value: "month", label: "Maand" },
  { value: "year", label: "Jaar" },
];
const METRICS: HoursMetric[] = ["planned", "registered", "invoiced"];
const HIDDEN_KEY = "dashboard.hiddenResources";

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
  const [metric, setMetric] = useState<HoursMetric>("planned");
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
  const loose = metric === "planned" && includeLoose ? "1" : "0";

  const { data, isLoading, error } = useQuery({
    queryKey: ["dashboard-hours", metric, range.from, range.to, loose],
    queryFn: () =>
      apiGet<DashboardHoursResponse>(
        `/api/dashboard/hours?metric=${metric}&from=${range.from}&to=${range.to}&loose=${loose}`,
      ),
    placeholderData: (prev) => prev,
  });

  const allIds = (data?.resources ?? []).map((r) => r.id);
  const withHours = new Set((data?.entries ?? []).map((e) => e.resourceId));
  // Chips: active resources + any (inactive) resource that has hours in this period.
  const chipResources = (data?.resources ?? []).filter((r) => r.active || withHours.has(r.id));
  const series: ChartSeries[] = chipResources
    .filter((r) => !hidden.has(r.id))
    .map((r) => ({ id: r.id, name: r.name, color: resourceColor(r.id, allIds) }));
  const seriesIds = series.map((s) => s.id);
  const cells = bucketHours(data?.entries ?? [], buckets, seriesIds);
  const totals = totalsPerResource(cells, seriesIds);
  const grandTotal = seriesIds.reduce((sum, id) => sum + totals[id], 0);

  return (
    <div className="p-4 md:p-8">
      <PageHeader title="Dashboard" />

      {/* filters: one row above the chart */}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Segmented
          label="Soort uren"
          value={metric}
          onChange={setMetric}
          options={METRICS.map((m) => ({ value: m, label: METRIC_SHORT_LABELS[m] }))}
        />
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
        {metric === "planned" && (
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input type="checkbox" checked={includeLoose} onChange={(e) => setIncludeLoose(e.target.checked)} />
            Losse todo&apos;s meetellen
          </label>
        )}
      </div>

      {/* resource toggles = legend */}
      <div className="mb-3 flex flex-wrap gap-2" aria-label="Resources tonen">
        {chipResources.map((r) => {
          const on = !hidden.has(r.id);
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
                style={{ background: on ? resourceColor(r.id, allIds) : "transparent", border: `2px solid ${resourceColor(r.id, allIds)}` }}
              />
              {r.name}
              {r.type === "MACHINE" && <span className="text-xs text-gray-400">machine</span>}
            </button>
          );
        })}
      </div>

      {error && <ErrorNote message={(error as Error).message} />}
      {isLoading && !data && <Spinner />}

      {data && (
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="font-semibold">
              {METRIC_LABELS[metric]} per resource{" "}
              <span className="font-normal text-gray-500">
                · per {period === "week" ? "dag" : period === "month" ? "week" : "maand"}
              </span>
            </h2>
            <p className="text-sm text-gray-600">
              Totaal: <span className="font-medium tabular-nums text-gray-900">{formatHours(grandTotal)}</span>
            </p>
          </div>
          {series.length === 0 ? (
            <p className="py-10 text-center text-sm text-gray-500">Zet minstens één resource aan.</p>
          ) : (
            <HoursChart buckets={buckets} series={series} cells={cells} mode={mode} />
          )}

          {series.length > 0 && (
            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-xs text-gray-500">
                  <tr className="border-b border-gray-200">
                    <th className="py-1.5 pr-3 font-medium">Resource</th>
                    {buckets.map((b) => (
                      <th key={b.key} className="px-2 py-1.5 text-right font-medium">
                        {b.label}
                      </th>
                    ))}
                    <th className="py-1.5 pl-3 text-right font-medium">Totaal</th>
                  </tr>
                </thead>
                <tbody className="tabular-nums">
                  {series.map((s) => (
                    <tr key={s.id} className="border-b border-gray-100">
                      <td className="whitespace-nowrap py-1.5 pr-3">
                        <span className="mr-2 inline-block h-2.5 w-2.5 rounded-sm" style={{ background: s.color }} />
                        {s.name}
                      </td>
                      {buckets.map((b) => (
                        <td key={b.key} className="px-2 py-1.5 text-right text-gray-700">
                          {cells[b.key][s.id] ? cells[b.key][s.id].toLocaleString("nl-BE") : "–"}
                        </td>
                      ))}
                      <td className="py-1.5 pl-3 text-right font-medium">{formatHours(totals[s.id])}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="mt-3 text-xs text-gray-400">
            {metric === "planned"
              ? "Gepland = niet-geannuleerde blokken. Per resource telt de bloklengte, begrensd door de uren die voor die resource op de todo voorzien zijn."
              : metric === "registered"
                ? "Geregistreerd = de echt gewerkte uren bij het klaarmelden, op de dag van het blok."
                : "Gefactureerd = de uren die bij het klaarmelden naar de factuur gingen, op de dag van het blok."}
          </p>
        </div>
      )}
    </div>
  );
}
