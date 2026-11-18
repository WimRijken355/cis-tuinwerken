import { z } from "zod";

/**
 * Shared server-side pagination contract and pure helpers, used by the
 * paginated list endpoints (customers, price list) and the <Pagination> UI.
 */

export const PAGE_SIZE_OPTIONS = [10, 25, 50, 100] as const;
export const DEFAULT_PAGE_SIZE = 25;

export const paginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(DEFAULT_PAGE_SIZE),
});
export type PaginationQuery = z.infer<typeof paginationQuerySchema>;

export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

/** Number of pages (always at least 1, so "page 1 of 1" for an empty list). */
export function pageCount(total: number, pageSize: number): number {
  return Math.max(1, Math.ceil(total / pageSize));
}

/** Prisma skip/take for a page. */
export function toSkipTake({ page, pageSize }: PaginationQuery): { skip: number; take: number } {
  return { skip: (page - 1) * pageSize, take: pageSize };
}

/** 1-based index range shown on the current page, e.g. { from: 26, to: 50 }; {0,0} when empty. */
export function visibleRange(page: number, pageSize: number, total: number): { from: number; to: number } {
  if (total === 0) return { from: 0, to: 0 };
  const from = (page - 1) * pageSize + 1;
  return { from: Math.min(from, total), to: Math.min(page * pageSize, total) };
}

/**
 * Page numbers to render as buttons, with "…" gaps:
 * always the first and last page, plus `siblings` pages around the current one.
 * e.g. pageButtons(6, 12) → [1, "…", 5, 6, 7, "…", 12]
 */
export function pageButtons(page: number, totalPages: number, siblings = 1): (number | "…")[] {
  const pages = new Set<number>([1, totalPages]);
  for (let p = page - siblings; p <= page + siblings; p++) {
    if (p >= 1 && p <= totalPages) pages.add(p);
  }
  const sorted = [...pages].sort((a, b) => a - b);
  const result: (number | "…")[] = [];
  sorted.forEach((p, i) => {
    const prev = sorted[i - 1];
    if (prev !== undefined && p - prev > 1) {
      // A gap of exactly one page is shown as that page instead of "…".
      result.push(p - prev === 2 ? p - 1 : "…");
    }
    result.push(p);
  });
  return result;
}
