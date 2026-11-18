"use client";

import { useEffect, useRef, useState } from "react";
import { type Bucket, formatHours, type HoursMetric, METRIC_SHORT_LABELS, niceTicks } from "@/lib/dashboard";

export interface ChartSeries {
  id: number;
  name: string;
  color: string;
}

type Cells = Record<string, Record<number, number>>;

const HEIGHT = 300;
const M = { top: 30, right: 8, bottom: 30, left: 44 };
const GAP = 2; // surface gap between adjacent bars / stacked segments
const CLUSTER_GAP = 4; // between resource clusters (grouped) or metric stacks (stacked)
const TOOLTIP_W = 230;

/** Rect with only the top corners rounded (data end), anchored to the baseline. */
function barPath(x: number, y: number, w: number, h: number, rounded: boolean): string {
  if (h <= 0 || w <= 0) return "";
  const r = rounded ? Math.min(4, h, w / 2) : 0;
  return `M${x},${y + h} V${y + r} Q${x},${y} ${x + r},${y} H${x + w - r} Q${x + w},${y} ${x + w},${y + r} V${y + h} Z`;
}

/**
 * Fill of a bar. With one metric: the solid resource color. With several, the
 * color keeps meaning "resource" and the metric is told by texture:
 * registered = solid, planned = 45° hatch on a light tint, invoiced = 135° hatch.
 */
function fillFor(color: string, metric: HoursMetric, textured: boolean, resourceId: number): string {
  if (!textured || metric === "registered") return color;
  return `url(#pat-${metric}-${resourceId})`;
}

export function MetricSwatch({ metric, color = "#52514e" }: { metric: HoursMetric; color?: string }) {
  return (
    <svg width={14} height={14} aria-hidden className="inline-block align-[-2px]">
      <Patterns series={[{ id: -1, name: "", color }]} />
      <rect x={0.5} y={0.5} width={13} height={13} rx={2} fill={fillFor(color, metric, true, -1)} stroke={color} />
    </svg>
  );
}

function Patterns({ series }: { series: ChartSeries[] }) {
  return (
    <defs>
      {series.map((s) => (
        <g key={s.id}>
          <pattern id={`pat-planned-${s.id}`} width={6} height={6} patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <rect width={6} height={6} fill={s.color} fillOpacity={0.22} />
            <rect width={2.5} height={6} fill={s.color} />
          </pattern>
          <pattern id={`pat-invoiced-${s.id}`} width={6} height={6} patternUnits="userSpaceOnUse" patternTransform="rotate(135)">
            <rect width={6} height={6} fill={s.color} fillOpacity={0.55} />
            <rect width={3.5} height={6} fill={s.color} />
          </pattern>
        </g>
      ))}
    </defs>
  );
}

interface Bar {
  key: string;
  x: number;
  w: number;
  value: number;
  base: number; // stacked: value below this segment
  fill: string;
  rounded: boolean;
  gapBelow: boolean;
}

/**
 * Bar chart of hours per resource per bucket for one or more metrics.
 * Grouped: per resource its metrics side by side. Stacked: one stack per
 * metric (resources stacked). One y-axis (hours). Hover a column for values.
 */
export function HoursChart({
  buckets,
  series,
  metrics,
  cells,
  mode,
}: {
  buckets: Bucket[];
  series: ChartSeries[];
  metrics: HoursMetric[];
  cells: Partial<Record<HoursMetric, Cells>>;
  mode: "grouped" | "stacked";
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(800);
  const [hover, setHover] = useState<number | null>(null);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => setWidth(Math.max(320, entry.contentRect.width)));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const textured = metrics.length > 1;
  const val = (m: HoursMetric, bucket: string, id: number) => cells[m]?.[bucket]?.[id] ?? 0;
  const stackTotal = (m: HoursMetric, bucket: string) => series.reduce((sum, s) => sum + val(m, bucket, s.id), 0);

  const maxValue =
    mode === "stacked"
      ? Math.max(0, ...buckets.flatMap((b) => metrics.map((m) => stackTotal(m, b.key))))
      : Math.max(0, ...buckets.flatMap((b) => metrics.flatMap((m) => series.map((s) => val(m, b.key, s.id)))));
  const ticks = niceTicks(maxValue);
  const top = ticks.at(-1)!;

  const innerW = width - M.left - M.right;
  const innerH = HEIGHT - M.top - M.bottom;
  const groupW = innerW / Math.max(1, buckets.length);
  const groupInner = groupW * (metrics.length > 1 && mode === "grouped" ? 0.9 : 0.78);
  const y = (v: number) => M.top + innerH - (v / top) * innerH;

  function barsFor(bucket: string, cx: number): Bar[] {
    const bars: Bar[] = [];
    if (mode === "grouped") {
      const nR = Math.max(1, series.length);
      const nM = metrics.length;
      const avail = groupInner - (nR - 1) * CLUSTER_GAP - nR * (nM - 1) * GAP;
      const w = Math.max(2, Math.min(28, avail / (nR * nM)));
      const clusterW = nM * w + (nM - 1) * GAP;
      const totalW = nR * clusterW + (nR - 1) * CLUSTER_GAP;
      series.forEach((s, ri) => {
        metrics.forEach((m, mi) => {
          bars.push({
            key: `${s.id}-${m}`,
            x: cx - totalW / 2 + ri * (clusterW + CLUSTER_GAP) + mi * (w + GAP),
            w,
            value: val(m, bucket, s.id),
            base: 0,
            fill: fillFor(s.color, m, textured, s.id),
            rounded: true,
            gapBelow: false,
          });
        });
      });
    } else {
      const nM = metrics.length;
      const w = Math.min(52, (groupInner - (nM - 1) * CLUSTER_GAP) / nM);
      const totalW = nM * w + (nM - 1) * CLUSTER_GAP;
      metrics.forEach((m, mi) => {
        const x = cx - totalW / 2 + mi * (w + CLUSTER_GAP);
        const visible = series.filter((s) => val(m, bucket, s.id) > 0);
        let acc = 0;
        visible.forEach((s, si) => {
          const v = val(m, bucket, s.id);
          bars.push({
            key: `${s.id}-${m}`,
            x,
            w,
            value: v,
            base: acc,
            fill: fillFor(s.color, m, textured, s.id),
            rounded: si === visible.length - 1,
            gapBelow: si > 0,
          });
          acc += v;
        });
      });
    }
    return bars;
  }

  const stackLabelX = (cx: number, mi: number) => {
    const nM = metrics.length;
    const w = Math.min(52, (groupInner - (nM - 1) * CLUSTER_GAP) / nM);
    const totalW = nM * w + (nM - 1) * CLUSTER_GAP;
    return cx - totalW / 2 + mi * (w + CLUSTER_GAP) + w / 2;
  };

  const hovered = hover !== null ? buckets[hover] : null;

  return (
    <div ref={wrapRef} className="relative w-full">
      <svg width={width} height={HEIGHT} role="img" aria-label="Uren per resource">
        <Patterns series={series} />
        {ticks.map((t) => (
          <g key={t}>
            <line x1={M.left} x2={width - M.right} y1={y(t)} y2={y(t)} stroke="#e7e6e2" strokeWidth={1} />
            <text x={M.left - 6} y={y(t)} dy="0.32em" textAnchor="end" fontSize={11} fill="#6b6a65">
              {t.toLocaleString("nl-BE")}
            </text>
          </g>
        ))}
        <text x={M.left - 6} y={M.top - 16} textAnchor="end" fontSize={11} fill="#6b6a65">
          uren
        </text>

        {buckets.map((b, i) => {
          const gx = M.left + i * groupW;
          const cx = gx + groupW / 2;
          return (
            <g key={b.key}>
              {hover === i && <rect x={gx} y={M.top} width={groupW} height={innerH} fill="#f3f2ee" />}
              {barsFor(b.key, cx).map((bar) => {
                const yTop = y(bar.base + bar.value);
                const h = y(bar.base) - yTop - (bar.gapBelow ? GAP : 0);
                return <path key={bar.key} d={barPath(bar.x, yTop, bar.w, Math.max(0, h), bar.rounded)} fill={bar.fill} />;
              })}
              {/* direct label: the total on top of each stack */}
              {mode === "stacked" &&
                metrics.map((m, mi) => {
                  const total = stackTotal(m, b.key);
                  return total > 0 ? (
                    <text key={m} x={stackLabelX(cx, mi)} y={y(total) - 5} textAnchor="middle" fontSize={11} fill="#3a3935">
                      {total.toLocaleString("nl-BE", { maximumFractionDigits: 1 })}
                    </text>
                  ) : null;
                })}
              <text x={cx} y={HEIGHT - M.bottom + 16} textAnchor="middle" fontSize={11} fill="#6b6a65">
                {b.label}
              </text>
              <rect
                x={gx}
                y={M.top}
                width={groupW}
                height={innerH + M.bottom}
                fill="transparent"
                onMouseEnter={() => setHover(i)}
                onMouseLeave={() => setHover(null)}
              />
            </g>
          );
        })}
        <line x1={M.left} x2={width - M.right} y1={y(0)} y2={y(0)} stroke="#b9b8b2" strokeWidth={1} />
      </svg>

      {hovered && hover !== null && (
        <div
          className="pointer-events-none absolute z-10 rounded-md border border-gray-200 bg-white px-3 py-2 text-xs shadow-md"
          // Beside the hovered column (right of it, or left when there is no room) — never over its bars.
          style={{
            top: M.top,
            left:
              M.left + (hover + 1) * groupW + 8 + TOOLTIP_W <= width
                ? M.left + (hover + 1) * groupW + 8
                : Math.max(0, M.left + hover * groupW - 8 - TOOLTIP_W),
            width: TOOLTIP_W,
          }}
        >
          <p className="mb-1 font-medium text-gray-900">
            {hovered.from === hovered.to ? hovered.label : `${hovered.label} (${fmt(hovered.from)} – ${fmt(hovered.to)})`}
          </p>
          <table className="w-full tabular-nums">
            {metrics.length > 1 && (
              <thead>
                <tr className="text-gray-500">
                  <th />
                  {metrics.map((m) => (
                    <th key={m} className="pl-2 text-right font-normal">
                      {METRIC_SHORT_LABELS[m].slice(0, 5)}.
                    </th>
                  ))}
                </tr>
              </thead>
            )}
            <tbody>
              {series.map((s) => (
                <tr key={s.id} className="text-gray-700">
                  <td className="py-px">
                    <span className="mr-1.5 inline-block h-2.5 w-2.5 rounded-sm" style={{ background: s.color }} />
                    {s.name}
                  </td>
                  {metrics.map((m) => (
                    <td key={m} className="pl-2 text-right">
                      {formatHours(val(m, hovered.key, s.id))}
                    </td>
                  ))}
                </tr>
              ))}
              {series.length > 1 && (
                <tr className="border-t border-gray-100 font-medium text-gray-900">
                  <td className="pt-1">Totaal</td>
                  {metrics.map((m) => (
                    <td key={m} className="pl-2 pt-1 text-right">
                      {formatHours(stackTotal(m, hovered.key))}
                    </td>
                  ))}
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function fmt(day: string): string {
  const [, m, d] = day.split("-");
  return `${Number(d)}/${Number(m)}`;
}
