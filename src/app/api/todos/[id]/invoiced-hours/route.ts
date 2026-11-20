import { type NextRequest, NextResponse } from "next/server";
import { ApiError, handleApiError, requireUser } from "@/lib/api";
import { db } from "@/lib/db";
import type { EfInvoiceItem } from "@/lib/ef/types";
import {
  canEditInvoice,
  contentFromItems,
  type InvoiceContent,
  itemsFromContent,
  rebuildContentKeepingNotes,
  totalOfContent,
} from "@/lib/invoice-content";
import { buildJobInvoice } from "@/lib/registration";
import { invoicedHoursUpdateSchema } from "@/lib/schemas/completions";
import { loadInvoiceDays } from "@/lib/services/registration";

/**
 * PATCH /api/todos/:id/invoiced-hours — change the hours to invoice of
 * registered days afterwards (e.g. left at 0 while registering).
 * - Days without invoice: only the hours change; invoicing happens with
 *   POST /api/todos/:id/close.
 * - Days on an invoice that is not in EenvoudigFactureren yet (canEditInvoice):
 *   that invoice is rebuilt from its days (remarks + notes kept,
 *   rebuildContentKeepingNotes) — it is then ready to be sent.
 * - Days on an invoice that is already in EF: refused (change it in EF).
 */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireUser();
    const todoId = Number((await params).id);
    if (!Number.isInteger(todoId) || todoId <= 0) throw new ApiError("Ongeldig todo-id", 400);
    const { entries } = invoicedHoursUpdateSchema.parse(await request.json());

    const labor = await db.laborEntry.findMany({
      where: { id: { in: entries.map((e) => e.laborEntryId) } },
      include: {
        completion: {
          select: {
            appointment: { select: { todoId: true } },
            includedInInvoice: { select: { id: true, efInvoiceId: true, pushStatus: true } },
          },
        },
      },
    });
    if (labor.length !== entries.length || labor.some((l) => l.completion.appointment.todoId !== todoId)) {
      throw new ApiError("Een of meer registratielijnen horen niet bij deze todo", 400);
    }
    const invoices = new Map<number, { id: number; efInvoiceId: number | null; pushStatus: string }>();
    for (const l of labor) {
      const inv = l.completion.includedInInvoice;
      if (!inv) continue;
      if (!canEditInvoice(inv as Parameters<typeof canEditInvoice>[0])) {
        throw new ApiError(
          "Deze dag staat al op een factuur in EenvoudigFactureren; pas die factuur daar aan.",
          409,
        );
      }
      invoices.set(inv.id, inv);
    }

    const rebuilt = await db.$transaction(async (tx) => {
      for (const e of entries) {
        await tx.laborEntry.update({ where: { id: e.laborEntryId }, data: { invoicedHours: e.invoicedHours } });
      }
      const result: { id: number; totalExclVat: number }[] = [];
      for (const invoiceId of invoices.keys()) {
        const invoice = await tx.invoice.findUniqueOrThrow({ where: { id: invoiceId } });
        const built = buildJobInvoice({ days: await loadInvoiceDays(invoiceId, tx) });
        if (built.lines.length === 0) {
          throw new ApiError(
            "Een factuur heeft minstens één regel: zet op minstens één dag uren om te factureren.",
            409,
          );
        }
        const previous =
          (invoice.contentJson as InvoiceContent | null) ??
          contentFromItems(invoice.linesJson as unknown as EfInvoiceItem[]);
        const content = rebuildContentKeepingNotes(built, previous);
        await tx.invoice.update({
          where: { id: invoiceId },
          data: {
            contentJson: content as unknown as object,
            linesJson: itemsFromContent(content) as unknown as object,
            totalExclVat: totalOfContent(content),
            editedAt: new Date(),
          },
        });
        result.push({ id: invoiceId, totalExclVat: totalOfContent(content) });
      }
      return result;
    });

    return NextResponse.json({ updated: entries.length, invoices: rebuilt });
  } catch (error) {
    return handleApiError(error);
  }
}
