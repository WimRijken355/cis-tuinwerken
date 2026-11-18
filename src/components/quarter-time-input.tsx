"use client";

import { QUARTER_MINUTES, roundTimeToQuarter } from "@/lib/planning";

const pad = (n: number) => String(n).padStart(2, "0");
const selectClass = "rounded-md border border-gray-300 bg-white px-2 py-2 text-sm";

/**
 * Start time as two dropdowns: hour (00–23) and minutes (00/15/30/45) —
 * the quarter is the smallest unit in the planning, so odd times like 08:07
 * cannot be picked. Value/onChange use "HH:mm"; an incoming odd time is shown
 * rounded to the nearest quarter.
 */
export function QuarterTimeInput({
  value,
  onChange,
  ariaLabel = "Startuur",
}: {
  value: string;
  onChange: (value: string) => void;
  ariaLabel?: string;
}) {
  const [hour, minute] = roundTimeToQuarter(value).split(":").map(Number);

  return (
    <div className="flex items-center gap-1" role="group" aria-label={ariaLabel}>
      <select
        aria-label="Uur"
        value={hour}
        onChange={(e) => onChange(`${pad(Number(e.target.value))}:${pad(minute)}`)}
        className={selectClass}
      >
        {Array.from({ length: 24 }, (_, h) => (
          <option key={h} value={h}>
            {pad(h)}
          </option>
        ))}
      </select>
      <span className="text-gray-500">:</span>
      <select
        aria-label="Minuten"
        value={minute}
        onChange={(e) => onChange(`${pad(hour)}:${pad(Number(e.target.value))}`)}
        className={selectClass}
      >
        {QUARTER_MINUTES.map((m) => (
          <option key={m} value={m}>
            {pad(m)}
          </option>
        ))}
      </select>
    </div>
  );
}
