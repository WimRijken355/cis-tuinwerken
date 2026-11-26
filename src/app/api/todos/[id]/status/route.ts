import { type NextRequest, NextResponse } from "next/server";
import { ApiError, handleApiError, requireUser } from "@/lib/api";
import { db } from "@/lib/db";
import { manualStatusTarget, manualTodoStatusSchema } from "@/lib/todo-status";

/**
 * PUT /api/todos/:id/status — set the status by hand (rules: src/lib/todo-status.ts).
 * OPEN/PLANNED reopen the todo (status follows its planned blocks); DONE and
 * CANCELLED cancel the blocks still planned. Registrations and invoices are
 * never touched.
 */
export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireUser();
    const id = Number((await params).id);
    if (!Number.isInteger(id) || id <= 0) throw new ApiError("Ongeldig todo-id", 400);
    const { status: requested } = manualTodoStatusSchema.parse(await request.json());

    const todo = await db.todo.findUnique({
      where: { id },
      select: {
        status: true,
        completedAt: true,
        _count: { select: { appointments: { where: { status: "PLANNED" } } } },
      },
    });
    if (!todo) throw new ApiError("Todo niet gevonden", 404);

    const status = manualStatusTarget(requested, todo._count.appointments);
    await db.$transaction(async (tx) => {
      if (status === "DONE" || status === "CANCELLED") {
        await tx.appointment.updateMany({ where: { todoId: id, status: "PLANNED" }, data: { status: "CANCELLED" } });
      }
      await tx.todo.update({
        where: { id },
        data: {
          status,
          completedAt: status === "DONE" ? (todo.status === "DONE" ? todo.completedAt : new Date()) : null,
        },
      });
    });
    return NextResponse.json({ status });
  } catch (error) {
    return handleApiError(error);
  }
}
