"use client";

import { useEffect, useRef, useState } from "react";
import { type Bucket, formatHours, niceTicks } from "@/lib/dashboard";

export interface ChartSeries {
  id: number;
  name: string;
  color: string;
}

const HEIGHT = 300;
const M = { top: 30, right: 8, bottom: 30, left: 44 };
const GAP = 2; // surface gap between adjacent bars / stacked segments
const TOOLTIP_W = 190;

/** Rect with only the top corners rounded (data end), anchored to the baseline. */
function barPath(x: number, y: number, w: number, h: number, rounded: boolean): string {
  if (h <= 0 || w <= 0) return "";
  const r = rounded ? Math.min(4, h, w / 2) : 0;
  return `M${x},${y + h} V${y + r} Q${x},${y} ${x + r},${y} H${x + w - r} Q${x + w},${y} ${x + w},${y + r} V${y + h} Z`;
}

/**
 * Bar chart of hours per resource per bucket: bars side by side ("grouped")
 * or stacked into one total per bucket. One y-axis (hours). Hover a column
 * for the exact values.
 */
export function HoursChart({
  buckets,
  series,
  cells,
  mode,
}: {
  buckets: Bucket[];
  series: ChartSeries[];
  cells: Record<string, Record<number, number>>;
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

  const totals = buckets.map((b) => series.reduce((sum, s) => sum + (cells[b.key]?.[s.id] ?? 0), 0));
  const maxValue =
    mode === "stacked"
      ? Math.max(0, ...totals)
      : Math.max(0, ...buckets.flatMap((b) => series.map((s) => cells[b.key]?.[s.id] ?? 0)));
  const ticks = niceTicks(maxValue);
  const top = ticks.at(-1)!;

  const innerW = width - M.left - M.right;
  const innerH = HEIGHT - M.top - M.bottom;
  const groupW = innerW / Math.max(1, buckets.length);
  const groupInner = groupW * 0.72;
  const y = (v: number) => M.top + innerH - (v / top) * innerH;
  const n = Math.max(1, series.length);
  const groupedBarW = Math.max(2, Math.min(28, (groupInner - GAP * (n - 1)) / n));
  const stackedBarW = Math.min(groupInner, 52);

  const hovered = hover !== null ? buckets[hover] : null;

  return (
    <div ref={wrapRef} className="relative w-full">
      <svg width={width} height={HEIGHT} role="img" aria-label="Uren per resource">
        {/* recessive grid + y-axis labels */}
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
              {mode === "grouped"
                ? series.map((s, si) => {
                    const v = cells[b.key]?.[s.id] ?? 0;
                    const total = n * groupedBarW + (n - 1) * GAP;
                    const x = cx - total / 2 + si * (groupedBarW + GAP);
                    return <path key={s.id} d={barPath(x, y(v), groupedBarW, y(0) - y(v), true)} fill={s.color} />;
                  })
                : (() => {
                    let acc = 0;
                    const visible = series.filter((s) => (cells[b.key]?.[s.id] ?? 0) > 0);
                    return visible.map((s, si) => {
                      const v = cells[b.key][s.id];
                      const yTop = y(acc + v);
                      const yBottom = y(acc);
                      acc += v;
                      const isTop = si === visible.length - 1;
                      const h = yBottom - yTop - (si > 0 ? GAP : 0);
                      return (
                        <path
                          key={s.id}
                          d={barPath(cx - stackedBarW / 2, yTop, stackedBarW, Math.max(0, h), isTop)}
                          fill={s.color}
                        />
                      );
                    });
                  })()}
              {/* direct label: the total on top of a stack */}
              {mode === "stacked" && totals[i] > 0 && (
                <text x={cx} y={y(totals[i]) - 5} textAnchor="middle" fontSize={11} fill="#3a3935">
                  {totals[i].toLocaleString("nl-BE", { maximumFractionDigits: 1 })}
                </text>
              )}
              <text x={cx} y={HEIGHT - M.bottom + 16} textAnchor="middle" fontSize={11} fill="#6b6a65">
                {b.label}
              </text>
              {/* hit target: the whole column */}
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
          {series.map((s) => (
            <p key={s.id} className="flex items-center justify-between gap-3 text-gray-700">
              <span className="flex items-center gap-1.5">
                <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: s.color }} />
                {s.name}
              </span>
              <span className="tabular-nums">{formatHours(cells[hovered.key]?.[s.id] ?? 0)}</span>
            </p>
          ))}
          {series.length > 1 && (
            <p className="mt-1 flex justify-between border-t border-gray-100 pt-1 font-medium text-gray-900">
              <span>Totaal</span>
              <span className="tabular-nums">{formatHours(totals[hover])}</span>
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function fmt(day: string): string {
  const [, m, d] = day.split("-");
  return `${Number(d)}/${Number(m)}`;
}
