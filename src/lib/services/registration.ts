import type { Prisma } from "@/generated/prisma/client";
import { db } from "../db";
import { remainingMinutes, plannedMinutes } from "../planning";
import { defaultInvoiceNow, proposeHours, type RegisteredDay } from "../registration";
import type { RegistrationContextDto } from "../schemas/completions";
import { getSettings } from "./settings";

type Tx = Prisma.TransactionClient | typeof db;

/** Registered days of a todo that are not on an invoice yet, as input for buildJobInvoice. */
export async function loadUninvoicedDays(todoId: number, client: Tx = db): Promise<RegisteredDay[]> {
  return loadDays({ invoiceId: null, appointment: { todoId } }, client);
}

/** All registered days on one invoice (to rebuild it after its hours changed). */
export async function loadInvoiceDays(invoiceId: number, client: Tx = db): Promise<RegisteredDay[]> {
  return loadDays({ invoiceId }, client);
}

async function loadDays(where: Prisma.CompletionWhereInput, client: Tx): Promise<RegisteredDay[]> {
  const completions = await client.completion.findMany({
    where,
    include: { appointment: { select: { startAt: true } }, laborEntries: true, extraCharges: true },
    orderBy: { appointment: { startAt: "asc" } },
  });
  return completions.map((c) => ({
    date: c.appointment.startAt.toISOString(),
    labor: c.laborEntries.map((l) => ({
      resourceId: l.resourceId,
      name: l.workerName ?? "Zaakvoerder",
      type: l.resourceType ?? "PERSON",
      invoicedHours: Number(l.invoicedHours),
      hourlyRate: Number(l.hourlyRate),
      vatRate: Number(l.vatRate),
    })),
    extras: c.extraCharges.map((e) => ({
      priceListItemId: e.priceListItemId,
      description: e.description,
      quantity: Number(e.quantity),
      unit: e.unit,
      unitPrice: Number(e.unitPrice),
      vatRate: Number(e.vatRate),
    })),
  }));
}

/** Context for the registration screen of one appointment (block). */
export async function loadRegistrationContext(appointmentId: number): Promise<RegistrationContextDto | null> {
  const appointment = await db.appointment.findUnique({
    where: { id: appointmentId },
    include: {
      todo: {
        include: {
          resources: { include: { resource: true }, orderBy: { id: "asc" } },
          tasks: { orderBy: [{ sortOrder: "asc" }, { id: "asc" }] },
          appointments: { select: { id: true, status: true, durationMinutes: true } },
        },
      },
    },
  });
  if (!appointment) return null;
  const { todo } = appointment;

  // Hours already registered per resource on earlier days of this todo.
  const earlier = await db.laborEntry.groupBy({
    by: ["resourceId"],
    where: { completion: { appointment: { todoId: todo.id } }, resourceId: { not: null } },
    _sum: { registeredHours: true },
  });
  const registeredByResource = new Map(earlier.map((e) => [e.resourceId, Number(e._sum.registeredHours ?? 0)]));

  const planned = plannedMinutes(todo.appointments);
  const otherPlannedBlocks = todo.appointments.filter((a) => a.id !== appointment.id && a.status === "PLANNED").length;
  const remainingUnplanned = remainingMinutes(Number(todo.estimatedHours), planned);
  const settings = await getSettings();

  return {
    plannedResources: todo.resources.map((r) => {
      const already = registeredByResource.get(r.resourceId) ?? 0;
      return {
        resourceId: r.resourceId,
        name: r.resource.name,
        type: r.resource.type,
        hourlyRate: Number(r.resource.hourlyRate),
        todoHours: Number(r.hours),
        alreadyRegisteredHours: already,
        proposedHours: proposeHours({
          blockMinutes: appointment.durationMinutes,
          resourceTodoHours: Number(r.hours),
          alreadyRegisteredHours: already,
        }),
      };
    }),
    tasks: todo.tasks.map((t) => ({
      id: t.id,
      label: t.label,
      done: t.done,
      unplanned: t.unplanned,
      checklistItemId: t.checklistItemId,
    })),
    blockMinutes: appointment.durationMinutes,
    otherPlannedBlocks,
    remainingUnplannedMinutes: remainingUnplanned,
    defaultInvoiceNow: defaultInvoiceNow({ otherPlannedBlocks, remainingUnplannedMinutes: remainingUnplanned }),
    isProject: todo.isProject,
    uninvoicedDays: (await loadUninvoicedDays(todo.id)).map((d) => ({
      ...d,
      date: String(d.date),
      extras: d.extras.map((e) => ({ ...e, priceListItemId: e.priceListItemId ?? null })),
    })),
    laborVatRate: settings.laborVatRate,
  };
}
