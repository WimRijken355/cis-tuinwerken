import { type NextRequest, NextResponse } from "next/server";
import { handleApiError, requireUser } from "@/lib/api";
import { db } from "@/lib/db";
import { assertResourcesExist, replaceTodoResources } from "@/lib/services/todo-resources";
import { checklistNames, syncTodoTasks } from "@/lib/services/checklist-tasks";
import {
  todoInputSchema,
  todoResourcesInclude,
  toTodoResourceDtos,
  toTodoTaskDtos,
} from "@/lib/schemas/todos";
import type { Prisma } from "@/generated/prisma/client";

/**
 * GET /api/todos?customerId=&status=&plannable=1
 * - plannable=1 → alleen OPEN todo's (voor de planning-zijbalk),
 *   gesorteerd op voorkeursvenster (terugkerend werk eerst dat eraan komt).
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
        ? { status: "OPEN" }
        : status
          ? { status: status as Prisma.TodoWhereInput["status"] }
          : {}),
    };

    const todos = await db.todo.findMany({
      where,
      include: {
        customer: { select: { name: true } },
        recurringWindow: { select: { label: true } },
        ...todoResourcesInclude,
      },
      orderBy: plannable
        ? [{ windowStart: { sort: "asc", nulls: "last" } }, { createdAt: "asc" }]
        : [{ createdAt: "desc" }],
    });

    return NextResponse.json(
      todos.map((t) => ({
        ...t,
        estimatedHours: Number(t.estimatedHours),
        customerName: t.customer.name,
        windowLabel: t.recurringWindow?.label ?? null,
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

/** POST /api/todos — new todo for a customer, optionally with planned resources. */
export async function POST(request: NextRequest) {
  try {
    await requireUser();
    const { resources, taskIds, ...input } = todoInputSchema.parse(await request.json());
    await assertResourcesExist(resources);
    const names = await checklistNames(taskIds);

    const created = await db.todo.create({ data: input });
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
        customerName: todo.customer.name,
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
