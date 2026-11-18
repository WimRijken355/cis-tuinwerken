import { type NextRequest, NextResponse } from "next/server";
import { ApiError, handleApiError, requireUser } from "@/lib/api";
import { db } from "@/lib/db";
import type { EfInvoiceItem } from "@/lib/ef/types";
import {
  canEditInvoice,
  contentFromItems,
  invoiceContentSchema,
  itemsFromContent,
  totalOfContent,
  type InvoiceContent,
  vatSummary,
} from "@/lib/invoice-content";
import type { InvoiceDetailDto } from "@/lib/schemas/completions";

/**
 * GET /api/invoices/:id — one invoice in detail: exactly the lines that were
 * (or will be) sent to EenvoudigFactureren, and per registered day the hours
 * per resource (registered + invoiced) that the "Werkuren op <datum>" lines
 * were composed from.
 */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireUser();
    const id = Number((await params).id);
    if (!Number.isInteger(id) || id <= 0) throw new ApiError("Ongeldig factuur-id", 400);

    const invoice = await db.invoice.findUnique({
      where: { id },
      include: {
        customer: { select: { name: true, isDemo: true } },
        completion: { select: { appointment: { select: { todo: { select: { title: true } } } } } },
        completions: {
          include: {
            appointment: { select: { startAt: true } },
            laborEntries: { orderBy: { id: "asc" } },
            extraCharges: { orderBy: { id: "asc" } },
          },
        },
      },
    });
    if (!invoice) throw new ApiError("Factuur niet gevonden", 404);

    const dto: InvoiceDetailDto = {
      id: invoice.id,
      customerId: invoice.customerId,
      customerName: invoice.customer.name,
      customerIsDemo: invoice.customer.isDemo,
      efInvoiceId: invoice.efInvoiceId,
      pushStatus: invoice.pushStatus,
      totalExclVat: Number(invoice.totalExclVat),
      totalInclVat: vatSummary(invoice.linesJson as unknown as EfInvoiceItem[]).inclVat,
      errorMessage: invoice.errorMessage,
      createdAt: invoice.createdAt.toISOString(),
      pushedAt: invoice.pushedAt?.toISOString() ?? null,
      workTitle: invoice.completion.appointment.todo.title,
      items: invoice.linesJson as unknown as EfInvoiceItem[],
      content:
        (invoice.contentJson as unknown as InvoiceContent | null) ??
        contentFromItems(invoice.linesJson as unknown as EfInvoiceItem[]),
      editable: canEditInvoice(invoice),
      editedAt: invoice.editedAt?.toISOString() ?? null,
      days: invoice.completions
        .sort((a, b) => a.appointment.startAt.getTime() - b.appointment.startAt.getTime())
        .map((c) => ({
          date: c.appointment.startAt.toISOString(),
          note: c.note,
          labor: c.laborEntries.map((l) => ({
            name: l.workerName ?? "Zaakvoerder",
            type: l.resourceType ?? "PERSON",
            registeredHours: Number(l.registeredHours),
            invoicedHours: Number(l.invoicedHours),
            hourlyRate: Number(l.hourlyRate),
          })),
          extras: c.extraCharges.map((e) => ({
            description: e.description,
            quantity: Number(e.quantity),
            unit: e.unit,
            unitPrice: Number(e.unitPrice),
          })),
        })),
    };
    return NextResponse.json(dto);
  } catch (error) {
    return handleApiError(error);
  }
}

/**
 * PATCH /api/invoices/:id — edit an invoice that is not in EenvoudigFactureren
 * yet (status NOT_SYNCED or FAILED): the whole content (lines with quantity,
 * price, remark; note lines) is replaced. linesJson (the EF payload) and the
 * total are regenerated from it; the registrations themselves stay as they were.
 */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireUser();
    const id = Number((await params).id);
    if (!Number.isInteger(id) || id <= 0) throw new ApiError("Ongeldig factuur-id", 400);
    const content = invoiceContentSchema.parse(await request.json());

    const invoice = await db.invoice.findUnique({ where: { id } });
    if (!invoice) throw new ApiError("Factuur niet gevonden", 404);
    if (!canEditInvoice(invoice)) {
      throw new ApiError("Deze factuur staat al in EenvoudigFactureren en kan hier niet meer aangepast worden.", 409);
    }

    const updated = await db.invoice.update({
      where: { id },
      data: {
        contentJson: content as unknown as object,
        linesJson: itemsFromContent(content) as unknown as object,
        totalExclVat: totalOfContent(content),
        editedAt: new Date(),
        errorMessage: null,
      },
    });
    return NextResponse.json({ id: updated.id, totalExclVat: Number(updated.totalExclVat) });
  } catch (error) {
    return handleApiError(error);
  }
}
