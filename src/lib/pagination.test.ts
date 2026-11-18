import { describe, expect, it } from "vitest";
import {
  pageButtons,
  pageCount,
  paginationQuerySchema,
  toSkipTake,
  visibleRange,
} from "./pagination";

describe("paginationQuerySchema", () => {
  it("defaults to page 1 with 25 items and coerces query strings", () => {
    expect(paginationQuerySchema.parse({})).toEqual({ page: 1, pageSize: 25 });
    expect(paginationQuerySchema.parse({ page: "3", pageSize: "50" })).toEqual({ page: 3, pageSize: 50 });
  });

  it("rejects page 0 and page sizes above 100", () => {
    expect(() => paginationQuerySchema.parse({ page: "0" })).toThrow();
    expect(() => paginationQuerySchema.parse({ pageSize: "500" })).toThrow();
  });
});

describe("pageCount / toSkipTake / visibleRange", () => {
  it("computes pages, offsets and the visible range", () => {
    expect(pageCount(0, 25)).toBe(1);
    expect(pageCount(174, 25)).toBe(7);
    expect(toSkipTake({ page: 3, pageSize: 25 })).toEqual({ skip: 50, take: 25 });
    expect(visibleRange(7, 25, 174)).toEqual({ from: 151, to: 174 });
    expect(visibleRange(1, 25, 0)).toEqual({ from: 0, to: 0 });
  });
});

describe("pageButtons", () => {
  it("shows all pages when there are few", () => {
    expect(pageButtons(1, 1)).toEqual([1]);
    expect(pageButtons(2, 4)).toEqual([1, 2, 3, 4]);
  });

  it("collapses distant pages into ellipses", () => {
    expect(pageButtons(6, 12)).toEqual([1, "…", 5, 6, 7, "…", 12]);
    expect(pageButtons(1, 12)).toEqual([1, 2, "…", 12]);
    expect(pageButtons(12, 12)).toEqual([1, "…", 11, 12]);
  });

  it("fills a single-page gap with the page instead of an ellipsis", () => {
    expect(pageButtons(4, 12)).toEqual([1, 2, 3, 4, 5, "…", 12]);
  });
});
