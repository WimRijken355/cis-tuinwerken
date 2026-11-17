import { type NextRequest, NextResponse } from "next/server";
import { ApiError, handleApiError, jsonError, requireUser } from "@/lib/api";
import { db } from "@/lib/db";
import { pushInvoiceToEf } from "@/lib/services/invoices";

/**
 * POST /api/invoices/:id/retry-push — mislukte EF-push opnieuw proberen.
 * Kan alleen zolang er nog géén efInvoiceId is → nooit dubbele concepten.
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
    if (invoice.efInvoiceId) {
      throw new ApiError("Deze factuur staat al in EenvoudigFactureren", 409);
    }

    const result = await pushInvoiceToEf(id);
    if (!result.ok) {
      return jsonError(result.error ?? "Push mislukt", 502);
    }
    return NextResponse.json({ ok: true, efInvoiceId: result.efInvoiceId });
  } catch (error) {
    return handleApiError(error);
  }
}
