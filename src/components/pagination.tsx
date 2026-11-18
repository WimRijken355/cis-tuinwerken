"use client";

import { pageButtons, pageCount, PAGE_SIZE_OPTIONS, visibleRange } from "@/lib/pagination";

/**
 * Shared pager for paginated lists: "1–25 van 174", page-size picker,
 * previous/next and numbered page buttons. Stateless: the parent owns
 * page/pageSize (and should reset page to 1 when filters change).
 */
export function Pagination({
  page,
  pageSize,
  total,
  onPageChange,
  onPageSizeChange,
  itemLabel = "resultaten",
}: {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
  onPageSizeChange?: (pageSize: number) => void;
  /** Plural noun shown in the summary, e.g. "klanten". */
  itemLabel?: string;
}) {
  const totalPages = pageCount(total, pageSize);
  const { from, to } = visibleRange(page, pageSize, total);
  const btn =
    "min-w-8 rounded-md border px-2 py-1 text-sm disabled:cursor-not-allowed disabled:opacity-40";

  return (
    <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm text-gray-600">
      <div className="flex items-center gap-3">
        <span>
          {total === 0 ? `Geen ${itemLabel}` : `${from}–${to} van ${total} ${itemLabel}`}
        </span>
        {onPageSizeChange && (
          <label className="flex items-center gap-1">
            <span className="sr-only md:not-sr-only">Per pagina</span>
            <select
              value={pageSize}
              onChange={(e) => onPageSizeChange(Number(e.target.value))}
              className="rounded-md border border-gray-300 bg-white px-2 py-1 text-sm"
            >
              {PAGE_SIZE_OPTIONS.map((size) => (
                <option key={size} value={size}>
                  {size}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>

      {totalPages > 1 && (
        <nav className="flex items-center gap-1" aria-label="Paginering">
          <button
            type="button"
            className={`${btn} border-gray-300 bg-white hover:bg-gray-50`}
            disabled={page <= 1}
            onClick={() => onPageChange(page - 1)}
            aria-label="Vorige pagina"
          >
            ‹
          </button>
          {pageButtons(page, totalPages).map((p, i) =>
            p === "…" ? (
              <span key={`gap-${i}`} className="px-1 text-gray-400">
                …
              </span>
            ) : (
              <button
                key={p}
                type="button"
                onClick={() => onPageChange(p)}
                aria-current={p === page ? "page" : undefined}
                className={`${btn} ${
                  p === page
                    ? "border-brand-600 bg-brand-600 text-white"
                    : "border-gray-300 bg-white hover:bg-gray-50"
                }`}
              >
                {p}
              </button>
            ),
          )}
          <button
            type="button"
            className={`${btn} border-gray-300 bg-white hover:bg-gray-50`}
            disabled={page >= totalPages}
            onClick={() => onPageChange(page + 1)}
            aria-label="Volgende pagina"
          >
            ›
          </button>
        </nav>
      )}
    </div>
  );
}

/** Wrapper that gives filter fields a consistent, wrapping layout above a list. */
export function FilterBar({
  children,
  onReset,
  active,
}: {
  children: React.ReactNode;
  onReset?: () => void;
  /** Whether any filter is set (shows the reset button). */
  active?: boolean;
}) {
  return (
    <div className="mb-4 flex flex-wrap items-end gap-2 rounded-lg border border-gray-200 bg-white p-3">
      {children}
      {onReset && active && (
        <button
          type="button"
          onClick={onReset}
          className="px-2 py-2 text-sm text-brand-600 hover:underline"
        >
          Filters wissen
        </button>
      )}
    </div>
  );
}

/** Compact labelled filter input/select wrapper. */
export function FilterField({
  label,
  children,
  className = "w-40",
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <label className={`block ${className}`}>
      <span className="text-xs font-medium text-gray-500">{label}</span>
      <div className="mt-0.5">{children}</div>
    </label>
  );
}

export const selectClass = "w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm";
