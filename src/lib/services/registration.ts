import type { Prisma } from "@/generated/prisma/client";
import { db } from "../db";
import { dayKey, remainingMinutes, plannedMinutes } from "../planning";
import { defaultInvoiceNow, proposeHours, type InvoiceJob, type RegisteredDay } from "../registration";
import type { RegisteredDayDto, RegistrationContextDto, UninvoicedJobDto } from "../schemas/completions";
import { getSettings } from "./settings";
import { loadTodoQuoteLines } from "./todo-quote-lines";

type Tx = Prisma.TransactionClient | typeof db;

/** Registered days of a todo that are not on an invoice yet, as input for buildJobInvoice. */
export async function loadUninvoicedDays(todoId: number, client: Tx = db): Promise<RegisteredDay[]> {
  return loadDays({ invoiceId: null, appointment: { todoId } }, client);
}

/** All registered days on one invoice (to rebuild it after its hours changed). */
export async function loadInvoiceDays(invoiceId: number, client: Tx = db): Promise<RegisteredDay[]> {
  return loadDays({ invoiceId }, client);
}

/**
 * The todos on one invoice with their days and charged quote lines, in order
 * of their first day — to rebuild the invoice exactly as it was composed.
 */
export async function loadInvoiceJobs(invoiceId: number, client: Tx = db): Promise<InvoiceJob[]> {
  const completions = await client.completion.findMany({
    where: { invoiceId },
    select: { id: true, appointment: { select: { todoId: true, todo: { select: { title: true } } } } },
  });
  const days = await loadDays({ invoiceId }, client);
  const quoteLinks = await client.todoQuoteLine.findMany({
    where: { invoiceId },
    orderBy: { id: "asc" },
    include: { quoteLine: true },
  });
  const jobs = new Map<number, InvoiceJob>();
  const titleOf = new Map(completions.map((c) => [c.appointment.todoId, c.appointment.todo.title]));
  for (const day of days) {
    const job = jobs.get(day.todoId) ?? { todoId: day.todoId, title: titleOf.get(day.todoId) ?? "", days: [], quoteLines: [] };
    job.days.push(day);
    jobs.set(day.todoId, job);
  }
  for (const link of quoteLinks) {
    const job = jobs.get(link.todoId);
    if (!job) continue;
    job.quoteLines!.push({
      linkId: link.id,
      description: link.quoteLine.description,
      quantity: Number(link.quoteLine.quantity),
      unit: link.quoteLine.unit,
      amount: Number(link.quoteLine.amount),
      taxRate: Number(link.quoteLine.taxRate),
    });
  }
  return [...jobs.values()];
}

/** One todo's uninvoiced part (days + not yet invoiced quote lines) for an invoice. */
export async function loadUninvoicedJob(todoId: number, client: Tx = db): Promise<InvoiceJob> {
  const todo = await client.todo.findUniqueOrThrow({ where: { id: todoId }, select: { title: true } });
  const quoteLines = (await loadTodoQuoteLines(todoId, client)).filter((l) => l.invoiceId === null);
  return { todoId, title: todo.title, days: await loadUninvoicedDays(todoId, client), quoteLines };
}

const toDayDto = (d: RegisteredDay): RegisteredDayDto => ({
  date: String(d.date),
  labor: d.labor,
  extras: d.extras.map((e) => ({ ...e, priceListItemId: e.priceListItemId ?? null })),
});

/**
 * Finished, not yet invoiced work of a customer ("samen factureren"): its DONE
 * todos (no projects) with registered days that are not on an invoice, most
 * recent first.
 */
export async function loadUninvoicedJobs(customerId: number, excludeTodoId?: number): Promise<UninvoicedJobDto[]> {
  const todos = await db.todo.findMany({
    where: {
      customerId,
      status: "DONE",
      isProject: false,
      ...(excludeTodoId ? { id: { not: excludeTodoId } } : {}),
      appointments: { some: { completion: { invoiceId: null } } },
    },
    select: { id: true, title: true },
  });
  const jobs: UninvoicedJobDto[] = [];
  for (const t of todos) {
    const days = await loadUninvoicedDays(t.id);
    if (days.length === 0) continue;
    const quoteLines = (await loadTodoQuoteLines(t.id)).filter((l) => l.invoiceId === null);
    jobs.push({
      todoId: t.id,
      title: t.title,
      lastRegisteredOn: String(days[days.length - 1].date),
      days: days.map(toDayDto),
      quoteLines,
    });
  }
  return jobs.sort((a, b) => b.lastRegisteredOn.localeCompare(a.lastRegisteredOn));
}

/** Registered days matching `where`, each with the todo it belongs to. */
async function loadDays(where: Prisma.CompletionWhereInput, client: Tx): Promise<(RegisteredDay & { todoId: number })[]> {
  const completions = await client.completion.findMany({
    where,
    include: { appointment: { select: { startAt: true, todoId: true } }, laborEntries: true, extraCharges: true },
    orderBy: { appointment: { startAt: "asc" } },
  });
  return completions.map((c) => ({
    todoId: c.appointment.todoId,
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
    quoteLines: (await loadTodoQuoteLines(todo.id)).filter((l) => l.invoiceId === null),
    uninvoicedDays: (await loadUninvoicedDays(todo.id)).map(toDayDto),
    laborVatRate: settings.laborVatRate,
    todoTitle: todo.title,
    otherJobs: todo.customerId && !todo.isProject ? await loadUninvoicedJobs(todo.customerId, todo.id) : [],
    otherBlocksToday: todo.customerId ? await loadOtherBlocksSameDay(todo.customerId, todo.id, appointment.startAt) : [],
  };
}

/** Other PLANNED blocks of the customer on the same (Brussels) day, for other todos. */
async function loadOtherBlocksSameDay(
  customerId: number,
  todoId: number,
  startAt: Date,
): Promise<{ todoId: number; title: string; startAt: string }[]> {
  const around = { gte: new Date(startAt.getTime() - 36 * 3600_000), lte: new Date(startAt.getTime() + 36 * 3600_000) };
  const blocks = await db.appointment.findMany({
    where: { status: "PLANNED", startAt: around, todoId: { not: todoId }, todo: { customerId, isProject: false } },
    select: { todoId: true, startAt: true, todo: { select: { title: true } } },
    orderBy: { startAt: "asc" },
  });
  const day = dayKey(startAt);
  return blocks
    .filter((b) => dayKey(b.startAt) === day)
    .map((b) => ({ todoId: b.todoId, title: b.todo.title, startAt: b.startAt.toISOString() }));
}
