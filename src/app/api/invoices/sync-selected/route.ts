import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { handleApiError, jsonError, requireUser } from "@/lib/api";
import { db } from "@/lib/db";
import { SYNC_DISABLED_MESSAGE, selectInvoicesToSync } from "@/lib/services/invoice-sync";
import { pushInvoiceToEf } from "@/lib/services/invoices";
import { getSettings } from "@/lib/services/settings";

const bodySchema = z.object({ ids: z.array(z.number().int().positive()).min(1).max(500) });

/**
 * POST /api/invoices/sync-selected — body `{ ids }`: send the selected invoices
 * to EenvoudigFactureren, oldest first, one by one. Ids that cannot be sent
 * (already in EF, "niet versturen", demo customer, unknown) are skipped.
 * → { total, sent, failed, skipped, errors: [{ invoiceId, customerName, error }] }
 */
export async function POST(request: NextRequest) {
  try {
    await requireUser();
    const { ids } = bodySchema.parse(await request.json());
    const settings = await getSettings();
    if (!settings.efInvoiceSyncEnabled) return jsonError(SYNC_DISABLED_MESSAGE, 409);

    const requested = [...new Set(ids)];
    const candidates = await db.invoice.findMany({
      where: { id: { in: requested } },
      include: { customer: { select: { name: true, isDemo: true } } },
    });
    const toSync = selectInvoicesToSync(
      candidates.map((i) => ({ ...i, isDemoCustomer: i.customer.isDemo })),
      settings.efInvoiceSyncEnabled,
    );

    let sent = 0;
    const errors: { invoiceId: number; customerName: string; error: string }[] = [];
    for (const invoice of toSync) {
      const result = await pushInvoiceToEf(invoice.id);
      if (result.ok) sent++;
      else errors.push({ invoiceId: invoice.id, customerName: invoice.customer.name, error: result.error ?? "Push mislukt" });
    }
    return NextResponse.json({
      total: toSync.length,
      sent,
      failed: errors.length,
      skipped: requested.length - toSync.length,
      errors,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
