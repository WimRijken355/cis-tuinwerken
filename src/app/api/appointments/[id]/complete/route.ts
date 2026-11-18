import { type NextRequest, NextResponse } from "next/server";
import { ApiError, handleApiError, requireUser } from "@/lib/api";
import { db } from "@/lib/db";
import { completionInputSchema } from "@/lib/schemas/completions";
import { buildInvoiceLines } from "@/lib/services/invoice-builder";
import { initialSyncAction } from "@/lib/services/invoice-sync";
import { markInvoiceNotSynced, pushInvoiceToEf } from "@/lib/services/invoices";
import { getSettings } from "@/lib/services/settings";

/**
 * POST /api/appointments/:id/complete — werk afronden vanaf de telefoon.
 *
 * Stap 1 (één transactie, altijd lokaal gecommit):
 *   registratie (uren + extra's met tariefsnapshots), afspraak → DONE,
 *   todo → DONE, factuur lokaal aangemaakt (PENDING, regels als snapshot).
 * Stap 2 (buiten de transactie): push naar EenvoudigFactureren als concept.
 *   Faalt die, dan blijft alles lokaal correct en toont de UI een retry.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requireUser();
    const id = Number((await params).id);
    const input = completionInputSchema.parse(await request.json());

    const appointment = await db.appointment.findUnique({
      where: { id },
      include: { todo: { include: { customer: true } }, completion: true },
    });
    if (!appointment) throw new ApiError("Afspraak niet gevonden", 404);
    if (appointment.completion) throw new ApiError("Deze afspraak is al geregistreerd", 409);
    if (appointment.status !== "PLANNED") {
      throw new ApiError("Alleen geplande afspraken kunnen afgerond worden", 409);
    }

    const settings = await getSettings();

    // Factuurregels bouwen (valideert ook de EF-limieten).
    const built = buildInvoiceLines({
      completion: input,
      workTitle: appointment.todo.title,
      workDate: appointment.startAt,
      ownHourlyRate: settings.ownHourlyRate,
      laborVatRate: settings.laborVatRate,
    });

    // Stap 1: alles lokaal in één transactie.
    const invoice = await db.$transaction(async (tx) => {
      const completion = await tx.completion.create({
        data: {
          appointmentId: appointment.id,
          note: input.note,
          laborEntries: {
            create: [
              {
                workerName: null, // de zaakvoerder zelf
                hours: input.ownHours,
                hourlyRate: settings.ownHourlyRate,
                vatRate: settings.laborVatRate,
              },
              ...input.workers.map((w) => ({
                workerName: w.name,
                hours: w.hours,
                hourlyRate: w.hourlyRate,
                vatRate: settings.laborVatRate,
              })),
            ],
          },
          extraCharges: {
            create: input.extras.map((e) => ({
              priceListItemId: e.priceListItemId ?? null,
              description: e.description,
              quantity: e.quantity,
              unit: e.unit,
              unitPrice: e.unitPrice,
              vatRate: e.vatRate,
            })),
          },
        },
      });

      await tx.appointment.update({
        where: { id: appointment.id },
        data: { status: "DONE" },
      });
      await tx.todo.update({
        where: { id: appointment.todoId },
        data: { status: "DONE", completedAt: new Date() },
      });

      return tx.invoice.create({
        data: {
          completionId: completion.id,
          customerId: appointment.todo.customer.id,
          pushStatus: "PENDING",
          linesJson: built.items as unknown as object,
          totalExclVat: built.totalExclVat,
        },
      });
    });

    // Stap 2: push naar EF (nooit blokkerend voor de registratie), unless
    // invoice sync is switched off in Settings: then the invoice stays local.
    const efPush =
      initialSyncAction(settings.efInvoiceSyncEnabled, appointment.todo.customer.isDemo) === "skip"
        ? await markInvoiceNotSynced(invoice.id).then(() => ({ ok: false, skipped: true }))
        : await pushInvoiceToEf(invoice.id).then((push) =>
            push.ok ? { ok: true, efInvoiceId: push.efInvoiceId } : { ok: false, error: push.error },
          );

    return NextResponse.json(
      {
        completed: true,
        invoiceId: invoice.id,
        totalExclVat: built.totalExclVat,
        efPush,
      },
      { status: 201 },
    );
  } catch (error) {
    return handleApiError(error);
  }
}
