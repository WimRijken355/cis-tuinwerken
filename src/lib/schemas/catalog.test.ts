import { describe, expect, it } from "vitest";
import { buildPriceListWhere, priceListQuerySchema } from "./catalog";

describe("priceListQuerySchema + buildPriceListWhere", () => {
  it("has no filters by default", () => {
    const q = priceListQuerySchema.parse({ page: "1" });
    expect(q).toMatchObject({ status: "all", source: "all" });
    expect(q.vatRate).toBeUndefined();
    expect(buildPriceListWhere(q)).toEqual({});
  });

  it("filters on name, VAT rate, status and EF source", () => {
    const q = priceListQuerySchema.parse({
      page: "2",
      name: "gras",
      vatRate: "6",
      status: "active",
      source: "ef",
    });
    expect(buildPriceListWhere(q)).toEqual({
      name: { contains: "gras", mode: "insensitive" },
      vatRate: 6,
      active: true,
      efStockItemId: { not: null },
    });
  });

  it("supports inactive + manually created items and ignores an empty VAT filter", () => {
    const q = priceListQuerySchema.parse({ vatRate: "", status: "inactive", source: "manual" });
    expect(buildPriceListWhere(q)).toEqual({ active: false, efStockItemId: null });
  });

  it("rejects an unsupported VAT rate", () => {
    expect(() => priceListQuerySchema.parse({ vatRate: "15" })).toThrow();
  });
});
