import { NextResponse } from "next/server";
import { handleApiError, jsonError, requireUser } from "@/lib/api";
import { db } from "@/lib/db";
import { SYNC_DISABLED_MESSAGE, selectInvoicesToSync } from "@/lib/services/invoice-sync";
import { pushInvoiceToEf } from "@/lib/services/invoices";
import { getSettings } from "@/lib/services/settings";

/**
 * POST /api/invoices/sync-all — send every invoice that is not in
 * EenvoudigFactureren yet (status NOT_SYNCED or FAILED), oldest first, one by
 * one. Skips "niet versturen" invoices and demo customers (selectInvoicesToSync).
 * → { total, sent, failed, errors: [{ invoiceId, customerName, error }] }
 */
export async function POST() {
  try {
    await requireUser();
    const settings = await getSettings();
    if (!settings.efInvoiceSyncEnabled) return jsonError(SYNC_DISABLED_MESSAGE, 409);

    const candidates = await db.invoice.findMany({
      where: { efInvoiceId: null, pushStatus: { in: ["NOT_SYNCED", "FAILED"] } },
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
    return NextResponse.json({ total: toSync.length, sent, failed: errors.length, errors });
  } catch (error) {
    return handleApiError(error);
  }
}
