import { type NextRequest, NextResponse } from "next/server";
import { ApiError, handleApiError, jsonError, requireUser } from "@/lib/api";
import { db } from "@/lib/db";
import { canSendToEf } from "@/lib/services/invoice-sync";
import { pushInvoiceToEf } from "@/lib/services/invoices";
import { getSettings } from "@/lib/services/settings";

/**
 * POST /api/invoices/:id/retry-push — send a failed or not-synced invoice to
 * EF. Refused while invoice sync is off in Settings, and once there is an
 * efInvoiceId (never duplicate concepts). Rules: canSendToEf().
 */
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requireUser();
    const id = Number((await params).id);

    const invoice = await db.invoice.findUnique({ where: { id } });
    if (!invoice) throw new ApiError("Factuur niet gevonden", 404);

    const settings = await getSettings();
    const check = canSendToEf(invoice, settings.efInvoiceSyncEnabled);
    if (!check.allowed) throw new ApiError(check.reason, check.status);

    const result = await pushInvoiceToEf(id);
    if (!result.ok) {
      return jsonError(result.error ?? "Push mislukt", 502);
    }
    return NextResponse.json({ ok: true, efInvoiceId: result.efInvoiceId });
  } catch (error) {
    return handleApiError(error);
  }
}
