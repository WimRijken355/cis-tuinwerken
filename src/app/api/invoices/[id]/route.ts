import { type NextRequest, NextResponse } from "next/server";
import { ApiError, handleApiError, requireUser } from "@/lib/api";
import { db } from "@/lib/db";
import type { EfInvoiceItem } from "@/lib/ef/types";
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
      errorMessage: invoice.errorMessage,
      createdAt: invoice.createdAt.toISOString(),
      pushedAt: invoice.pushedAt?.toISOString() ?? null,
      workTitle: invoice.completion.appointment.todo.title,
      items: invoice.linesJson as unknown as EfInvoiceItem[],
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
