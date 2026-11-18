import { type NextRequest, NextResponse } from "next/server";
import { ApiError, handleApiError, requireUser } from "@/lib/api";
import { db } from "@/lib/db";
import { todoTaskToggleSchema } from "@/lib/schemas/todos";

/** PATCH /api/todos/:id/tasks/:taskId — tick a checklist task off (or on again). */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; taskId: string }> },
) {
  try {
    await requireUser();
    const { id, taskId } = await params;
    const todoId = Number(id);
    const tid = Number(taskId);
    if (!Number.isInteger(todoId) || !Number.isInteger(tid) || todoId <= 0 || tid <= 0) {
      throw new ApiError("Ongeldig id", 400);
    }
    const { done } = todoTaskToggleSchema.parse(await request.json());

    const task = await db.todoTask.findUnique({ where: { id: tid } });
    if (!task || task.todoId !== todoId) throw new ApiError("Taak niet gevonden", 404);

    const updated = await db.todoTask.update({ where: { id: tid }, data: { done } });
    return NextResponse.json({
      id: updated.id,
      checklistItemId: updated.checklistItemId,
      label: updated.label,
      done: updated.done,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
