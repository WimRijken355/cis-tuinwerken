import { type NextRequest, NextResponse } from "next/server";
import { ApiError, handleApiError, requireUser } from "@/lib/api";
import { db } from "@/lib/db";
import { assertResourcesExist, replaceTodoResources } from "@/lib/services/todo-resources";
import { checklistNames, syncTodoTasks } from "@/lib/services/checklist-tasks";
import { formatAddress } from "@/lib/schemas/customers";
import {
  CONTACT_KEYS,
  resolveTodoOwner,
  todoResourcesInclude,
  todoUpdateSchema,
  toTodoResourceDtos,
  toTodoTaskDtos,
  type TodoRegistrationDto,
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
        customer: { select: { name: true, street: true, postalCode: true, city: true } },
        appointments: {
          orderBy: { startAt: "desc" },
          include: {
            completion: {
              include: {
                laborEntries: { orderBy: { id: "asc" } },
                extraCharges: { orderBy: { id: "asc" } },
                includedInInvoice: { select: { id: true, pushStatus: true, totalExclVat: true } },
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
            name: l.workerName ?? "Zaakvoerder",
            type: l.resourceType ?? "PERSON",
            registeredHours: Number(l.registeredHours),
            invoicedHours: Number(l.invoicedHours),
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
                totalExclVat: Number(c.includedInInvoice.totalExclVat),
              }
            : null,
        };
      })
      .sort((x, y) => x.date.localeCompare(y.date));
    return NextResponse.json({
      ...todo,
      appointments: todo.appointments.map(({ completion: _completion, ...a }) => a),
      registrations,
      estimatedHours: Number(todo.estimatedHours),
      customerName: todo.customer?.name ?? todo.contactName ?? "",
      /** Address of the linked customer (for the editor's customer picker). */
      customerAddress: todo.customer ? formatAddress(todo.customer) : "",
      resources: toTodoResourceDtos(todo.resources),
      tasks: toTodoTaskDtos(todo.tasks),
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
    const { resources, taskIds, customerId, contactName, contactStreet, contactPostalCode, contactCity, ...input } =
      todoUpdateSchema.parse(body);
    const current = await db.todo.findUnique({ where: { id }, select: { customerId: true } });
    if (!current) throw new ApiError("Todo niet gevonden", 404);

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
        ...(owner.contact ?? {}),
        ...(input.status === "DONE" ? { completedAt: new Date() } : {}),
        ...(input.status === "OPEN" ? { completedAt: null } : {}),
      },
    });
    if (resources) await replaceTodoResources(id, resources);
    if (taskIds && names) await syncTodoTasks(id, taskIds, names);
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
