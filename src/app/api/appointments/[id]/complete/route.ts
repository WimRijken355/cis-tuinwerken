import { type NextRequest, NextResponse } from "next/server";
import { ApiError, handleApiError, requireUser } from "@/lib/api";
import { db } from "@/lib/db";
import { buildJobInvoice } from "@/lib/registration";
import { completionInputSchema } from "@/lib/schemas/completions";
import { syncTodoStatus } from "@/lib/services/appointments";
import { initialSyncAction } from "@/lib/services/invoice-sync";
import { markInvoiceNotSynced, pushInvoiceToEf } from "@/lib/services/invoices";
import { loadUninvoicedDays } from "@/lib/services/registration";
import { getSettings } from "@/lib/services/settings";

/**
 * POST /api/appointments/:id/complete — register a day's work (mostly from a phone).
 *
 * Step 1 (one transaction, always committed locally):
 *   registration per resource (registered + invoiced hours, rate snapshots),
 *   extras, checklist result, appointment → DONE.
 *   With `invoiceNow`: all not yet invoiced days of this todo go on one
 *   local invoice (PENDING), remaining planned blocks are cancelled and the
 *   todo → DONE. Without: the todo stays open for the next block.
 * Step 2 (outside the transaction, only when invoiced): push to EF as concept.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireUser();
    const id = Number((await params).id);
    const input = completionInputSchema.parse(await request.json());

    const appointment = await db.appointment.findUnique({
      where: { id },
      include: { todo: { include: { customer: true, tasks: true } }, completion: true },
    });
    if (!appointment) throw new ApiError("Afspraak niet gevonden", 404);
    if (appointment.completion) throw new ApiError("Deze afspraak is al geregistreerd", 409);
    if (appointment.status !== "PLANNED") {
      throw new ApiError("Alleen geplande afspraken kunnen afgerond worden", 409);
    }
    const customer = appointment.todo.customer;
    if (!customer) {
      throw new ApiError("Een losse todo (zonder klant) wordt niet geregistreerd of gefactureerd.", 409);
    }

    // Rates are snapshots of the resources as they are now (never taken from the client).
    const resources = await db.resource.findMany({ where: { id: { in: input.resources.map((r) => r.resourceId) } } });
    if (resources.length !== input.resources.length) {
      throw new ApiError("Een of meer resources bestaan niet (meer)", 400);
    }
    const resourceById = new Map(resources.map((r) => [r.id, r]));
    const settings = await getSettings();
    const todoTaskIds = new Set(appointment.todo.tasks.map((t) => t.id));

    const result = await db.$transaction(async (tx) => {
      const completion = await tx.completion.create({
        data: {
          appointmentId: appointment.id,
          note: input.note,
          laborEntries: {
            create: input.resources.map((r) => {
              const res = resourceById.get(r.resourceId)!;
              return {
                resourceId: res.id,
                resourceType: res.type,
                workerName: res.name,
                registeredHours: r.registeredHours,
                invoicedHours: r.invoicedHours,
                hourlyRate: res.hourlyRate,
                vatRate: settings.laborVatRate,
              };
            }),
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

      // Checklist: done-state of the planned tasks + extra tasks that were done.
      for (const state of input.taskStates) {
        if (todoTaskIds.has(state.id)) {
          await tx.todoTask.update({ where: { id: state.id }, data: { done: state.done } });
        }
      }
      const nextSort = appointment.todo.tasks.reduce((max, t) => Math.max(max, t.sortOrder), -1) + 1;
      for (const [i, task] of input.extraTasks.entries()) {
        await tx.todoTask.create({
          data: {
            todoId: appointment.todoId,
            checklistItemId: task.checklistItemId ?? null,
            label: task.label,
            done: true,
            unplanned: true,
            sortOrder: nextSort + i,
          },
        });
      }

      await tx.appointment.update({ where: { id: appointment.id }, data: { status: "DONE" } });

      if (!input.invoiceNow) return { invoice: null };

      // Invoice the whole job: every registered day of this todo not invoiced yet.
      const days = await loadUninvoicedDays(appointment.todoId, tx);
      const built = buildJobInvoice({ workTitle: appointment.todo.title, days });
      const invoice = await tx.invoice.create({
        data: {
          completionId: completion.id,
          customerId: customer.id,
          pushStatus: "PENDING",
          linesJson: built.items as unknown as object,
          totalExclVat: built.totalExclVat,
        },
      });
      await tx.completion.updateMany({
        where: { invoiceId: null, appointment: { todoId: appointment.todoId } },
        data: { invoiceId: invoice.id },
      });
      // The job is finished: blocks still planned for it are cancelled.
      await tx.appointment.updateMany({
        where: { todoId: appointment.todoId, status: "PLANNED" },
        data: { status: "CANCELLED" },
      });
      await tx.todo.update({
        where: { id: appointment.todoId },
        data: { status: "DONE", completedAt: new Date() },
      });
      return { invoice: { id: invoice.id, totalExclVat: built.totalExclVat } };
    });

    if (!result.invoice) {
      await syncTodoStatus(appointment.todoId);
      const nextBlocks = await db.appointment.count({ where: { todoId: appointment.todoId, status: "PLANNED" } });
      return NextResponse.json({ completed: true, invoiced: false, nextBlocks }, { status: 201 });
    }

    // Step 2: push to EF (never blocking the registration), unless sync is
    // switched off in Settings or this is a demo customer.
    const efPush =
      initialSyncAction(settings.efInvoiceSyncEnabled, customer.isDemo) === "skip"
        ? await markInvoiceNotSynced(result.invoice.id).then(() => ({ ok: false, skipped: true }))
        : await pushInvoiceToEf(result.invoice.id).then((push) =>
            push.ok ? { ok: true, efInvoiceId: push.efInvoiceId } : { ok: false, error: push.error },
          );

    return NextResponse.json(
      {
        completed: true,
        invoiced: true,
        invoiceId: result.invoice.id,
        totalExclVat: result.invoice.totalExclVat,
        efPush,
      },
      { status: 201 },
    );
  } catch (error) {
    return handleApiError(error);
  }
}
