"use client";

import { joinDuration, QUARTER_MINUTES, splitDuration, WORKDAY_MINUTES } from "@/lib/planning";

const pad = (n: number) => String(n).padStart(2, "0");
const selectClass = "rounded-md border border-gray-300 bg-white px-2 py-2 text-sm";

/**
 * Duration as two dropdowns: hours (0 … max) and minutes (00/15/30/45) — the
 * quarter is the smallest planning unit. Value/onChange in total minutes,
 * always between one quarter and `maxMinutes` (one working day by default).
 */
export function DurationInput({
  value,
  onChange,
  maxMinutes = WORKDAY_MINUTES,
}: {
  value: number;
  onChange: (minutes: number) => void;
  maxMinutes?: number;
}) {
  const { hours, minutes } = splitDuration(Math.min(value, maxMinutes));
  const maxHours = Math.floor(maxMinutes / 60);
  // At the maximum hour only the minutes that still fit are offered.
  const minuteOptions = QUARTER_MINUTES.filter((m) => hours * 60 + m <= maxMinutes);

  return (
    <div className="flex items-center gap-1.5" role="group" aria-label="Duur">
      <select
        aria-label="Uren"
        value={hours}
        onChange={(e) => onChange(joinDuration(Number(e.target.value), minutes, maxMinutes))}
        className={selectClass}
      >
        {Array.from({ length: maxHours + 1 }, (_, h) => (
          <option key={h} value={h}>
            {h}
          </option>
        ))}
      </select>
      <span className="text-sm text-gray-500">u</span>
      <select
        aria-label="Minuten"
        value={minutes}
        onChange={(e) => onChange(joinDuration(hours, Number(e.target.value), maxMinutes))}
        className={selectClass}
      >
        {minuteOptions.map((m) => (
          <option key={m} value={m}>
            {pad(m)}
          </option>
        ))}
      </select>
      <span className="text-sm text-gray-500">min</span>
    </div>
  );
}
