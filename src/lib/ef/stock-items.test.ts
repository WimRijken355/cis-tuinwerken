import { describe, expect, it } from "vitest";
import { mapEfTaxCategory, mapStockItemToProduct, planStockItemImport } from "./stock-items";

describe("mapEfTaxCategory", () => {
  it("maps EF VAT categories to percentages", () => {
    // 0 = no fixed rate on the item → standard 21%, unless an exemption code is set.
    expect(mapEfTaxCategory({ tax_category: 0, tax_category_special_status: "" })).toBe(21);
    expect(mapEfTaxCategory({ tax_category: 0, tax_category_special_status: "K" })).toBe(0);
    expect(mapEfTaxCategory({ tax_category: 1 })).toBe(21);
    expect(mapEfTaxCategory({ tax_category: 2 })).toBe(12);
    expect(mapEfTaxCategory({ tax_category: 3 })).toBe(6);
  });

  it("prefers a numeric tax_code and falls back to 21%", () => {
    expect(mapEfTaxCategory({ tax_category: 1, tax_code: "6" })).toBe(6);
    expect(mapEfTaxCategory({ tax_category: 1, tax_code: "BTW-HOOG" })).toBe(21);
    expect(mapEfTaxCategory({ tax_category: null })).toBe(21);
  });
});

describe("mapStockItemToProduct", () => {
  it("maps fields, truncates the unit and converts VAT-inclusive prices", () => {
    const product = mapStockItemToProduct({
      stockitem_id: 44,
      code: "ART-001",
      description: "  Afvoer groenafval ",
      price: 121,
      tax_category: 1,
      tax_included: "yes",
      unit: "kubieke meter",
      active: "no",
    });
    expect(product).toEqual({
      efStockItemId: 44,
      name: "Afvoer groenafval",
      unit: "kubieke me",
      unitPrice: 100,
      vatRate: 21,
      active: false,
    });
  });

  it('treats tax_included "no" (as the live API returns it) as excl. VAT', () => {
    const product = mapStockItemToProduct({
      stockitem_id: 1,
      description: "Frees",
      price: 100,
      tax_category: 3,
      tax_included: "no",
      unit: "",
    });
    expect(product).toMatchObject({ unitPrice: 100, vatRate: 6, unit: "stuk" });
  });

  it("falls back to code, 'stuk' and price 0", () => {
    const product = mapStockItemToProduct({ stockitem_id: 7, code: "MACH", price: null });
    expect(product).toMatchObject({ name: "MACH", unit: "stuk", unitPrice: 0, active: true });
  });
});

describe("planStockItemImport", () => {
  it("skips linked items, links by name and creates the rest", () => {
    const actions = planStockItemImport(
      [
        { stockitem_id: 1, description: "Haagschaar" },
        { stockitem_id: 2, description: "afvoer" },
        { stockitem_id: 3, description: "Nieuw" },
        { stockitem_id: 4, description: "AFVOER" },
      ],
      [
        { id: 10, name: "Haagschaar", efStockItemId: 1 },
        { id: 11, name: "Afvoer", efStockItemId: null },
      ],
    );
    expect(actions.map((a) => a.kind)).toEqual(["skip", "link", "create", "skip"]);
    expect(actions[1]).toMatchObject({ kind: "link", productId: 11 });
  });
});
