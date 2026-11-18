"use client";

import { useEffect, useRef, useState } from "react";

export interface MultiSelectOption<V extends string | number> {
  value: V;
  label: string;
}

/**
 * Compact dropdown with checkboxes to pick several options. The button shows
 * the placeholder when nothing is chosen, the label(s) when one or two are
 * chosen, otherwise "n gekozen". Closes on an outside click or Escape.
 */
export function MultiSelect<V extends string | number>({
  options,
  value,
  onChange,
  placeholder,
  ariaLabel,
}: {
  options: MultiSelectOption<V>[];
  value: V[];
  onChange: (value: V[]) => void;
  placeholder: string;
  ariaLabel: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const selected = new Set(value);
  const chosen = options.filter((o) => selected.has(o.value));
  const summary =
    chosen.length === 0
      ? placeholder
      : chosen.length <= 2
        ? chosen.map((o) => o.label).join(", ")
        : `${chosen.length} gekozen`;

  function toggle(v: V) {
    const next = new Set(selected);
    if (next.has(v)) next.delete(v);
    else next.add(v);
    // Keep the order of the options.
    onChange(options.filter((o) => next.has(o.value)).map((o) => o.value));
  }

  return (
    <div ref={ref} className="relative min-w-0 flex-1">
      <button
        type="button"
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className={`flex w-full items-center justify-between gap-1 rounded-md border px-2 py-1.5 text-left text-sm ${
          chosen.length > 0 ? "border-brand-500 bg-brand-50 text-brand-800" : "border-gray-300 bg-white text-gray-700"
        }`}
      >
        <span className="truncate">{summary}</span>
        <span className="text-[10px] text-gray-400">▼</span>
      </button>
      {open && (
        <div
          role="listbox"
          aria-multiselectable
          className="absolute z-30 mt-1 max-h-64 w-full min-w-44 overflow-y-auto rounded-md border border-gray-200 bg-white py-1 shadow-lg"
        >
          {options.length === 0 && <p className="px-3 py-1.5 text-sm text-gray-400">Geen opties</p>}
          {options.map((o) => (
            <label
              key={String(o.value)}
              className="flex cursor-pointer items-center gap-2 px-3 py-1 text-sm hover:bg-gray-50"
            >
              <input
                type="checkbox"
                checked={selected.has(o.value)}
                onChange={() => toggle(o.value)}
                className="h-3.5 w-3.5 accent-brand-600"
              />
              <span className="truncate">{o.label}</span>
            </label>
          ))}
          {chosen.length > 0 && (
            <button
              type="button"
              onClick={() => onChange([])}
              className="mt-1 w-full border-t border-gray-100 px-3 pt-1.5 text-left text-xs text-brand-600 hover:underline"
            >
              Selectie wissen
            </button>
          )}
        </div>
      )}
    </div>
  );
}
