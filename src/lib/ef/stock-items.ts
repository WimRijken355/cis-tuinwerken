import type { EfStockItem } from "./types";

/**
 * Pure mapping/matching logic for importing EenvoudigFactureren stock items
 * ("artikels") into the local price list (PriceListItem). No database or
 * network access here, so it can be unit tested in isolation.
 */

/** VAT rates the app supports (see priceListItemInputSchema). */
const SUPPORTED_VAT_RATES = [0, 6, 12, 21] as const;

/**
 * EF's `tax_category` (0-3) → VAT percentage.
 *
 * The EF API docs list the enum (0,1,2,3) but not its meaning. Verified
 * against real invoice lines of this account (Nov 2026):
 * - 1 → 21% and 3 → 6% (plants) consistently;
 * - 0 means "no fixed rate on the item" (the document/client decides) — on
 *   invoices it mostly became 21%, so we default to 21%. Only when EF sets a
 *   VAT exemption code (`tax_category_special_status`) do we use 0%.
 * - 2 → 12% is an assumption (not used by this account).
 * If `tax_code` holds a plain percentage (accounts with dynamic VAT rates),
 * that wins. Unknown values fall back to 21%.
 */
export function mapEfTaxCategory(
  item: Pick<EfStockItem, "tax_category" | "tax_code" | "tax_category_special_status">,
): number {
  const fromCode = Number(item.tax_code?.replace("%", "").replace(",", ".").trim());
  if (item.tax_code && (SUPPORTED_VAT_RATES as readonly number[]).includes(fromCode)) {
    return fromCode;
  }
  switch (item.tax_category) {
    case 0:
      return item.tax_category_special_status?.trim() ? 0 : 21;
    case 2:
      return 12;
    case 3:
      return 6;
    default:
      return 21;
  }
}

/** EF returns "yes"/"no" for tax_included even though the docs say boolean. */
function isTaxIncluded(value: EfStockItem["tax_included"]): boolean {
  return value === true || value === "yes";
}

export interface ImportedProduct {
  efStockItemId: number;
  name: string;
  unit: string;
  unitPrice: number;
  vatRate: number;
  active: boolean;
}

/** Maps one EF stock item to the local price-list shape (prices always excl. VAT). */
export function mapStockItemToProduct(item: EfStockItem): ImportedProduct {
  const vatRate = mapEfTaxCategory(item);
  const rawPrice = item.price ?? 0;
  const priceExcl = isTaxIncluded(item.tax_included) ? rawPrice / (1 + vatRate / 100) : rawPrice;
  const name = item.description?.trim() || item.code?.trim() || `Artikel ${item.stockitem_id}`;
  return {
    efStockItemId: item.stockitem_id,
    name: name.slice(0, 200),
    // EF's own invoice-line unit limit is 10 chars; the DB column enforces it too.
    unit: (item.unit?.trim() || "stuk").slice(0, 10),
    unitPrice: Math.round(priceExcl * 100) / 100,
    vatRate,
    active: item.active !== "no",
  };
}

export interface ExistingProduct {
  id: number;
  name: string;
  efStockItemId: number | null;
}

export type ImportAction =
  | { kind: "skip"; efStockItemId: number }
  | { kind: "link"; productId: number; product: ImportedProduct }
  | { kind: "create"; product: ImportedProduct };

/**
 * Decides per EF stock item what to do, mirroring the customer import:
 * - already linked (efStockItemId known)          → skip (local data leads)
 * - same name (case-insensitive), not yet linked  → link
 * - same name but linked to another EF item       → skip
 * - unknown                                       → create
 * Idempotent: running it again creates no duplicates.
 */
export function planStockItemImport(
  efItems: EfStockItem[],
  existing: ExistingProduct[],
): ImportAction[] {
  const linkedIds = new Set(existing.map((p) => p.efStockItemId).filter((id) => id !== null));
  const byName = new Map(existing.map((p) => [p.name.trim().toLowerCase(), p]));
  const claimed = new Set<number>();

  return efItems.map((item): ImportAction => {
    if (linkedIds.has(item.stockitem_id)) {
      return { kind: "skip", efStockItemId: item.stockitem_id };
    }
    const product = mapStockItemToProduct(item);
    const match = byName.get(product.name.toLowerCase());
    if (match) {
      if (match.efStockItemId === null && !claimed.has(match.id)) {
        claimed.add(match.id);
        return { kind: "link", productId: match.id, product };
      }
      return { kind: "skip", efStockItemId: item.stockitem_id };
    }
    return { kind: "create", product };
  });
}
