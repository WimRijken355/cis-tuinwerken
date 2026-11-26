"use client";

import { QUARTER_TIMES, roundToQuarter } from "@/lib/arrival";

/**
 * Time picker per quarter hour ("HH:mm", 00:00 … 23:45). A native <select>
 * instead of <input type="time">: iOS Safari ignores `step` on time inputs and
 * would still offer every minute; a select shows a wheel with only quarters.
 * A value that is not on a quarter is shown rounded to the nearest quarter.
 */
export function QuarterTimeSelect({
  value,
  onChange,
  className = "",
  ...rest
}: {
  value: string;
  onChange: (time: string) => void;
  className?: string;
  "aria-label"?: string;
  required?: boolean;
}) {
  return (
    <select
      {...rest}
      value={roundToQuarter(value)}
      onChange={(e) => onChange(e.target.value)}
      className={`rounded-md border border-gray-300 bg-white px-3 py-2 text-sm tabular-nums focus:border-brand-500 focus:outline-none ${className}`}
    >
      {QUARTER_TIMES.map((t) => (
        <option key={t} value={t}>
          {t}
        </option>
      ))}
    </select>
  );
}
