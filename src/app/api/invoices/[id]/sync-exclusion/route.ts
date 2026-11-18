import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { ApiError, handleApiError, requireUser } from "@/lib/api";
import { db } from "@/lib/db";

const bodySchema = z.object({ excluded: z.boolean() });

/**
 * PUT /api/invoices/:id/sync-exclusion — `{ excluded: true }` = "niet versturen":
 * the invoice is never pushed to EF (single or bulk) until switched off again.
 * Only for invoices that are not in EF yet (409 otherwise).
 */
export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireUser();
    const id = Number((await params).id);
    if (!Number.isInteger(id) || id <= 0) throw new ApiError("Ongeldig factuur-id", 400);
    const { excluded } = bodySchema.parse(await request.json());

    const invoice = await db.invoice.findUnique({ where: { id } });
    if (!invoice) throw new ApiError("Factuur niet gevonden", 404);
    if (invoice.efInvoiceId) {
      throw new ApiError("Deze factuur staat al in EenvoudigFactureren.", 409);
    }
    const updated = await db.invoice.update({ where: { id }, data: { syncExcluded: excluded } });
    return NextResponse.json({ id: updated.id, syncExcluded: updated.syncExcluded });
  } catch (error) {
    return handleApiError(error);
  }
}
