import { type NextRequest, NextResponse } from "next/server";
import { ApiError, handleApiError, requireUser } from "@/lib/api";
import { db } from "@/lib/db";
import { assertResourcesExist, replaceTodoResources } from "@/lib/services/todo-resources";
import { checklistNames, syncTodoTasks } from "@/lib/services/checklist-tasks";
import { canEditInvoice } from "@/lib/invoice-content";
import { formatAddress } from "@/lib/schemas/customers";
import { todoStatusActions } from "@/lib/todo-list";
import { loadTodoQuoteLines, replaceTodoQuoteLines } from "@/lib/services/todo-quote-lines";
import {
  CONTACT_KEYS,
  resolveTodoOwner,
  todoResourcesInclude,
  todoUpdateSchema,
  toTodoResourceDtos,
  toTodoTaskDtos,
  type TodoRegistrationDto,
  projectFlagForTodo,
} from "@/lib/schemas/todos";

async function parseId(params: Promise<{ id: string }>): Promise<number> {
  const id = Number((await params).id);
  if (!Number.isInteger(id) || id <= 0) throw new ApiError("Ongeldig todo-id", 400);
  return id;
}

/** GET /api/todos/:id */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requireUser();
    const id = await parseId(params);
    const todo = await db.todo.findUnique({
      where: { id },
      include: {
        customer: { select: { name: true, street: true, postalCode: true, city: true, isDemo: true } },
        appointments: {
          orderBy: { startAt: "desc" },
          include: {
            completion: {
              include: {
                laborEntries: { orderBy: { id: "asc" } },
                extraCharges: { orderBy: { id: "asc" } },
                includedInInvoice: {
                  select: { id: true, pushStatus: true, totalExclVat: true, efInvoiceId: true, syncExcluded: true },
                },
              },
            },
          },
        },
        ...todoResourcesInclude,
      },
    });
    if (!todo) throw new ApiError("Todo niet gevonden", 404);
    const registrations: TodoRegistrationDto[] = todo.appointments
      .filter((a) => a.completion !== null)
      .map((a) => {
        const c = a.completion!;
        return {
          completionId: c.id,
          appointmentId: a.id,
          date: a.startAt.toISOString(),
          note: c.note,
          labor: c.laborEntries.map((l) => ({
            id: l.id,
            name: l.workerName ?? "Zaakvoerder",
            type: l.resourceType ?? "PERSON",
            registeredHours: Number(l.registeredHours),
            invoicedHours: Number(l.invoicedHours),
            rateUnit: l.rateUnit,
            invoicedDays: l.invoicedDays === null ? null : Number(l.invoicedDays),
          })),
          extras: c.extraCharges.map((e) => ({
            description: e.description,
            quantity: Number(e.quantity),
            unit: e.unit,
            unitPrice: Number(e.unitPrice),
          })),
          invoice: c.includedInInvoice
            ? {
                id: c.includedInInvoice.id,
                pushStatus: c.includedInInvoice.pushStatus,
                efInvoiceId: c.includedInInvoice.efInvoiceId,
                syncExcluded: c.includedInInvoice.syncExcluded,
                totalExclVat: Number(c.includedInInvoice.totalExclVat),
                editable: canEditInvoice(c.includedInInvoice),
              }
            : null,
        };
      })
      .sort((x, y) => x.date.localeCompare(y.date));
    return NextResponse.json({
      ...todo,
      appointments: todo.appointments.map(({ completion: _completion, ...a }) => a),
      registrations,
      customerIsDemo: todo.customer?.isDemo ?? false,
      estimatedHours: Number(todo.estimatedHours),
      customerName: todo.customer?.name ?? todo.contactName ?? "",
      /** Address of the linked customer (for the editor's customer picker). */
      customerAddress: todo.customer ? formatAddress(todo.customer) : "",
      resources: toTodoResourceDtos(todo.resources),
      tasks: toTodoTaskDtos(todo.tasks),
      quoteLines: await loadTodoQuoteLines(id),
      customer: undefined,
    });
  } catch (error) {
    return handleApiError(error);
  }
}

/**
 * PATCH /api/todos/:id — edit a todo like a new one: owner (customer or
 * losse todo with name/address), title, hours, status; `resources` /
 * `taskIds` replace their set. The owner cannot change any more once work on
 * the todo has been registered (its invoice belongs to that customer).
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requireUser();
    const id = await parseId(params);
    const body = (await request.json()) as Record<string, unknown>;
    const {
      resources,
      taskIds,
      quoteLineIds,
      customerId,
      contactName,
      contactStreet,
      contactPostalCode,
      contactCity,
      isProject,
      ...input
    } = todoUpdateSchema.parse(body);
    const current = await db.todo.findUnique({
      where: { id },
      select: { customerId: true, status: true, isProject: true, appointments: { select: { status: true } } },
    });
    if (!current) throw new ApiError("Todo niet gevonden", 404);
    // Cancelling follows the same rule as the button in the todo details
    // (todoStatusActions): never once work is planned or registered — a
    // (possibly stale) client cannot cancel registered, still to invoice work.
    if (input.status === "CANCELLED" && current.status !== "CANCELLED") {
      if (!todoStatusActions(current.status, current.appointments).canCancel) {
        throw new ApiError(
          current.appointments.some((a) => a.status === "DONE")
            ? "Er is al werk geregistreerd op deze todo; annuleren kan niet meer. Sluit de job af in plaats daarvan."
            : "Deze todo heeft nog geplande blokken; haal die eerst uit de planning.",
          409,
        );
      }
    }

    // Owner + contact (see resolveTodoOwner for the rules).
    const contactTouched = CONTACT_KEYS.some((key) => key in body);
    const owner = resolveTodoOwner(
      current,
      { customerId, contactName, contactStreet, contactPostalCode, contactCity },
      contactTouched,
    );
    if (owner.ownerChanged) {
      const registered = await db.completion.count({ where: { appointment: { todoId: id } } });
      if (registered > 0) {
        throw new ApiError("Er is al werk geregistreerd op deze todo; de klant kan niet meer gewijzigd worden.", 409);
      }
      if (owner.customerId !== null && !(await db.customer.findUnique({ where: { id: owner.customerId } }))) {
        throw new ApiError("Klant niet gevonden", 400);
      }
    }
    if (resources) await assertResourcesExist(resources);
    const names = taskIds ? await checklistNames(taskIds) : null;

    await db.todo.update({
      where: { id },
      data: {
        ...input,
        ...(owner.ownerChanged ? { customerId: owner.customerId } : {}),
        isProject: projectFlagForTodo(owner.customerId, isProject, current.isProject),
        ...(owner.contact ?? {}),
        ...(input.status === "DONE" ? { completedAt: new Date() } : {}),
        ...(input.status === "OPEN" ? { completedAt: null } : {}),
      },
    });
    if (resources) await replaceTodoResources(id, resources);
    if (taskIds && names) await syncTodoTasks(id, taskIds, names);
    // A new owner never keeps the previous customer's (uninvoiced) quote lines.
    if (quoteLineIds || owner.ownerChanged) {
      await replaceTodoQuoteLines(id, owner.customerId, owner.ownerChanged ? (quoteLineIds ?? []) : quoteLineIds!);
    }
    const todo = await db.todo.findUniqueOrThrow({ where: { id }, include: todoResourcesInclude });
    return NextResponse.json({
      ...todo,
      estimatedHours: Number(todo.estimatedHours),
      resources: toTodoResourceDtos(todo.resources),
      tasks: toTodoTaskDtos(todo.tasks),
    });
  } catch (error) {
    return handleApiError(error);
  }
}

/**
 * DELETE /api/todos/:id — alleen zolang er geen afspraken aan hangen;
 * daarna is annuleren (status CANCELLED) de juiste weg.
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requireUser();
    const id = await parseId(params);

    const todo = await db.todo.findUnique({
      where: { id },
      include: { _count: { select: { appointments: true } } },
    });
    if (!todo) throw new ApiError("Todo niet gevonden", 404);
    if (todo._count.appointments > 0) {
      throw new ApiError(
        "Deze todo heeft al afspraken. Annuleer hem in plaats van hem te verwijderen.",
        409,
      );
    }
    await db.todo.delete({ where: { id } });
    return NextResponse.json({ deleted: true });
  } catch (error) {
    return handleApiError(error);
  }
}
