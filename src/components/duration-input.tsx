"use client";

import { useEffect, useState } from "react";
import { joinDuration, MAX_PLAN_MINUTES, QUARTER_MINUTES, splitDuration } from "@/lib/planning";

const pad = (n: number) => String(n).padStart(2, "0");

/**
 * Duration as hours (free number, can be more than a working day) +
 * minutes (00/15/30/45 — the quarter is the smallest planning unit).
 * Value/onChange in total minutes, at least one quarter.
 */
export function DurationInput({
  value,
  onChange,
  maxMinutes = MAX_PLAN_MINUTES,
}: {
  value: number;
  onChange: (minutes: number) => void;
  maxMinutes?: number;
}) {
  const { hours, minutes } = splitDuration(value);
  // Keep the typed text while editing (so the field can be emptied briefly).
  const [hoursText, setHoursText] = useState(String(hours));
  useEffect(() => setHoursText(String(hours)), [hours]);

  return (
    <div className="flex items-center gap-1.5" role="group" aria-label="Duur">
      <input
        aria-label="Uren"
        type="number"
        inputMode="numeric"
        min={0}
        step={1}
        value={hoursText}
        onChange={(e) => {
          setHoursText(e.target.value);
          onChange(joinDuration(Number(e.target.value), minutes, maxMinutes));
        }}
        onBlur={() => setHoursText(String(hours))}
        className="w-20 rounded-md border border-gray-300 px-2 py-2 text-right text-sm focus:border-brand-500 focus:outline-none"
      />
      <span className="text-sm text-gray-500">u</span>
      <select
        aria-label="Minuten"
        value={minutes}
        onChange={(e) => onChange(joinDuration(hours, Number(e.target.value), maxMinutes))}
        className="rounded-md border border-gray-300 bg-white px-2 py-2 text-sm"
      >
        {QUARTER_MINUTES.map((m) => (
          <option key={m} value={m}>
            {pad(m)}
          </option>
        ))}
      </select>
      <span className="text-sm text-gray-500">min</span>
    </div>
  );
}
