import { ApiError } from "../api";
import { db } from "../db";
import type { TodoResourceInput } from "../schemas/todos";

/**
 * Writes a todo's planned resources. Uses explicit TodoResource operations
 * (not nested writes on Todo) so every change shows up in the audit trail.
 */

/** Throws 400 when a resource id does not exist. */
export async function assertResourcesExist(resources: TodoResourceInput[]): Promise<void> {
  if (resources.length === 0) return;
  const ids = resources.map((r) => r.resourceId);
  const found = await db.resource.count({ where: { id: { in: ids } } });
  if (found !== new Set(ids).size) {
    throw new ApiError("Een of meer gekozen resources bestaan niet (meer)", 400);
  }
}

/** Replaces the whole set of planned resources of a todo. */
export async function replaceTodoResources(
  todoId: number,
  resources: TodoResourceInput[],
): Promise<void> {
  await db.todoResource.deleteMany({ where: { todoId } });
  if (resources.length > 0) {
    await db.todoResource.createMany({
      data: resources.map((r) => ({ todoId, resourceId: r.resourceId, hours: r.hours })),
    });
  }
}
