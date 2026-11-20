"use client";

import { useEffect, useState } from "react";
import { ceilToHalfDay, ceilToQuarterHour, DAY_STEP } from "@/lib/registration";

const show = (hours: number) => String(hours).replace(".", ",");

/**
 * Thumb-friendly hours input for the phone: big − / + buttons in quarter
 * steps and a typed value that is rounded UP per started quarter on blur
 * (1,1 → 1,25). Value in hours. With `days` it counts days instead, in half
 * days (day-rate machines).
 */
export function HoursStepper({
  value,
  onChange,
  label,
  max,
  days = false,
}: {
  value: number;
  onChange: (value: number) => void;
  /** Accessible label, e.g. "Geregistreerd Cis". */
  label: string;
  max?: number;
  /** Count days (half-day steps) instead of hours. */
  days?: boolean;
}) {
  const [text, setText] = useState(show(value));
  useEffect(() => setText(show(value)), [value]);
  const step = days ? DAY_STEP : 0.25;
  const limit = max ?? (days ? 31 : 24);
  const stepLabel = days ? "halve dag" : "kwartier";

  const set = (v: number) => onChange(Math.min(limit, (days ? ceilToHalfDay : ceilToQuarterHour)(Math.max(0, v))));

  return (
    <div className="flex items-center gap-1.5" role="group" aria-label={label}>
      <button
        type="button"
        aria-label={`${label}: ${stepLabel} minder`}
        onClick={() => set(value - step)}
        className="h-10 w-10 shrink-0 rounded-full bg-gray-100 text-lg font-bold text-gray-700 active:bg-gray-200"
      >
        −
      </button>
      <input
        aria-label={label}
        inputMode="decimal"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={() => set(Number(text.replace(",", ".")) || 0)}
        onFocus={(e) => e.target.select()}
        className="h-10 w-16 rounded-md border border-gray-300 text-center text-base font-semibold focus:border-brand-500 focus:outline-none"
      />
      <button
        type="button"
        aria-label={`${label}: ${stepLabel} meer`}
        onClick={() => set(value + step)}
        className="h-10 w-10 shrink-0 rounded-full bg-gray-100 text-lg font-bold text-gray-700 active:bg-gray-200"
      >
        +
      </button>
      <span className="text-sm text-gray-500">{days ? (value === 1 ? "dag" : "dagen") : "u"}</span>
    </div>
  );
}
