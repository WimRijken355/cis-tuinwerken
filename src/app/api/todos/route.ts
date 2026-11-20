import { type NextRequest, NextResponse } from "next/server";
import { handleApiError, requireUser } from "@/lib/api";
import { db } from "@/lib/db";
import { assertResourcesExist, replaceTodoResources } from "@/lib/services/todo-resources";
import { checklistNames, syncTodoTasks } from "@/lib/services/checklist-tasks";
import {
  contactForTodo,
  todoInputSchema,
  todoPlace,
  todoResourcesInclude,
  toTodoResourceDtos,
  toTodoTaskDtos,
  projectFlagForTodo,
} from "@/lib/schemas/todos";
import type { Prisma } from "@/generated/prisma/client";
import { periodToWindow, windowLabel } from "@/lib/registration";
import { needsPlanning } from "@/lib/planning";
import { registeredOn, todoInvoiceState } from "@/lib/todo-list";
import { loadPlanningMeta } from "@/lib/services/appointments";

/**
 * GET /api/todos?customerId=&status=&plannable=1
 * - plannable=1 → todos that still have time left to plan (OPEN, or PLANNED
 *   but only partly), for the planning sidebar; sorted on preferred window
 *   (recurring work that is due first).
 * Every todo carries plannedMinutes / remainingMinutes / appointmentCount.
 */
export async function GET(request: NextRequest) {
  try {
    await requireUser();
    const sp = request.nextUrl.searchParams;
    const customerId = sp.get("customerId");
    const status = sp.get("status");
    const plannable = sp.get("plannable") === "1";

    const where: Prisma.TodoWhereInput = {
      ...(customerId ? { customerId: Number(customerId) } : {}),
      ...(plannable
        ? { status: { in: ["OPEN", "PLANNED"] } }
        : status
          ? { status: status as Prisma.TodoWhereInput["status"] }
          : {}),
    };

    const todos = await db.todo.findMany({
      where,
      include: {
        customer: { select: { name: true, street: true, city: true, postalCode: true } },
        recurringWindow: { select: { label: true } },
        ...todoResourcesInclude,
      },
      orderBy: plannable
        ? [{ windowStart: { sort: "asc", nulls: "last" } }, { createdAt: "asc" }]
        : [{ createdAt: "desc" }],
    });

    const meta = await loadPlanningMeta(todos.map((t) => t.id));
    // Invoice state per todo, from its registered days (Todo's overview).
    const completions = await db.completion.findMany({
      where: { appointment: { todoId: { in: todos.map((t) => t.id) } } },
      select: {
        appointment: { select: { todoId: true, startAt: true } },
        includedInInvoice: { select: { pushStatus: true, efInvoiceId: true, syncExcluded: true } },
      },
    });
    const daysByTodo = new Map<
      number,
      { date: Date; invoice: (typeof completions)[number]["includedInInvoice"] }[]
    >();
    for (const c of completions) {
      const list = daysByTodo.get(c.appointment.todoId) ?? [];
      list.push({ date: c.appointment.startAt, invoice: c.includedInInvoice });
      daysByTodo.set(c.appointment.todoId, list);
    }
    const withMeta = todos.map((t) => ({ todo: t, meta: meta.get(t.id) }));
    const visible = plannable ? withMeta.filter(({ meta: m }) => (m ? needsPlanning(m) : true)) : withMeta;

    return NextResponse.json(
      visible.map(({ todo: t, meta: m }) => ({
        ...t,
        estimatedHours: Number(t.estimatedHours),
        // Losse todo: falls back to its free-text contact name/address.
        customerName: todoPlace(t.customer, t).name,
        customerCity: todoPlace(t.customer, t).city,
        customerPostalCode: todoPlace(t.customer, t).postalCode,
        plannedMinutes: m?.plannedMinutes ?? 0,
        remainingMinutes: m?.remainingMinutes ?? 0,
        appointmentCount: m?.parts.size ?? 0,
        invoiceState: todoInvoiceState(daysByTodo.get(t.id) ?? [], t.isProject),
        registeredOn: registeredOn(
          (daysByTodo.get(t.id) ?? []).map((d) => d.date),
          t.status === "DONE" ? t.completedAt : null,
        ),
        // Recurring work: its window label; otherwise the preferred period ("apr 2027").
        windowLabel: t.recurringWindow?.label ?? windowLabel(t.windowStart, t.windowEnd),
        resources: toTodoResourceDtos(t.resources),
        tasks: toTodoTaskDtos(t.tasks),
        customer: undefined,
        recurringWindow: undefined,
      })),
    );
  } catch (error) {
    return handleApiError(error);
  }
}

/**
 * POST /api/todos — new todo for a customer, or a "losse todo" without
 * customer (customerId null: holiday, doctor, ...), optionally with resources
 * and checklist.
 */
export async function POST(request: NextRequest) {
  try {
    await requireUser();
    const {
      resources,
      taskIds,
      contactName,
      contactStreet,
      contactPostalCode,
      contactCity,
      preferredFrom,
      preferredTo,
      ...input
    } = todoInputSchema.parse(await request.json());
    await assertResourcesExist(resources);
    const names = await checklistNames(taskIds);

    const created = await db.todo.create({
      data: {
        ...input,
        isProject: projectFlagForTodo(input.customerId, input.isProject),
        ...contactForTodo(input.customerId, { contactName, contactStreet, contactPostalCode, contactCity }),
        ...(preferredFrom ? periodToWindow(preferredFrom, preferredTo) : {}),
      },
    });
    await replaceTodoResources(created.id, resources);
    await syncTodoTasks(created.id, taskIds, names);
    const todo = await db.todo.findUniqueOrThrow({
      where: { id: created.id },
      include: { customer: { select: { name: true } }, ...todoResourcesInclude },
    });
    return NextResponse.json(
      {
        ...todo,
        estimatedHours: Number(todo.estimatedHours),
        customerName: todo.customer?.name ?? todo.contactName ?? "",
        resources: toTodoResourceDtos(todo.resources),
        tasks: toTodoTaskDtos(todo.tasks),
        customer: undefined,
      },
      { status: 201 },
    );
  } catch (error) {
    return handleApiError(error);
  }
}
