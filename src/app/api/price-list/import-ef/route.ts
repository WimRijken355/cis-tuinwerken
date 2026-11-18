import { NextResponse } from "next/server";
import { handleApiError, jsonError, requireUser } from "@/lib/api";
import { db } from "@/lib/db";
import { EfApiError, efIsConfigured, listAllStockItems } from "@/lib/ef/client";
import { planStockItemImport } from "@/lib/ef/stock-items";

/**
 * POST /api/price-list/import-ef
 *
 * Imports the stock items ("artikels") from EenvoudigFactureren into the
 * local price list. Matching rules live in planStockItemImport(); existing
 * local items are only linked, never overwritten. Safe to run repeatedly.
 */
export async function POST() {
  try {
    await requireUser();
    if (!efIsConfigured()) {
      return jsonError(
        "EenvoudigFactureren is nog niet geconfigureerd. Vul EF_API_KEY (of EF_BASIC_USER/EF_BASIC_PASS) in je .env in.",
        400,
      );
    }

    const efItems = await listAllStockItems();
    const existing = await db.priceListItem.findMany({
      select: { id: true, name: true, efStockItemId: true },
    });

    let created = 0;
    let linked = 0;
    let skipped = 0;

    for (const action of planStockItemImport(efItems, existing)) {
      if (action.kind === "create") {
        await db.priceListItem.create({ data: action.product });
        created++;
      } else if (action.kind === "link") {
        await db.priceListItem.update({
          where: { id: action.productId },
          data: { efStockItemId: action.product.efStockItemId },
        });
        linked++;
      } else {
        skipped++;
      }
    }

    return NextResponse.json({ totalInEf: efItems.length, created, linked, skipped });
  } catch (error) {
    if (error instanceof EfApiError) {
      return jsonError(
        `Import mislukt: ${error.message}. Antwoord: ${error.responseBody.slice(0, 300)}`,
        502,
      );
    }
    return handleApiError(error);
  }
}
