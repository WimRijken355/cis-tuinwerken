import { ApiError } from "../api";
import { db } from "../db";
import { planTodoTaskSync } from "../schemas/todos";

/**
 * Writes checklist tasks of todos and recurring templates. Uses explicit
 * operations on the child tables (not nested writes) so every change shows
 * up in the audit trail.
 */

/** Throws 400 when a checklist item id does not exist; returns id → name. */
export async function checklistNames(ids: number[]): Promise<Map<number, string>> {
  if (ids.length === 0) return new Map();
  const items = await db.checklistItem.findMany({
    where: { id: { in: ids } },
    select: { id: true, name: true },
  });
  if (items.length !== new Set(ids).size) {
    throw new ApiError("Een of meer gekozen taken bestaan niet (meer)", 400);
  }
  return new Map(items.map((i) => [i.id, i.name]));
}

/** Brings a todo's checklist in line with `ids` (order = position), keeping "done" on tasks that stay. */
export async function syncTodoTasks(todoId: number, ids: number[], names: Map<number, string>): Promise<void> {
  const existing = await db.todoTask.findMany({
    where: { todoId },
    select: { id: true, checklistItemId: true, sortOrder: true },
  });
  const plan = planTodoTaskSync(existing, ids, names);
  if (plan.deleteIds.length > 0) {
    await db.todoTask.deleteMany({ where: { id: { in: plan.deleteIds } } });
  }
  for (const { id, sortOrder } of plan.updateSortOrder) {
    await db.todoTask.update({ where: { id }, data: { sortOrder } });
  }
  if (plan.create.length > 0) {
    await db.todoTask.createMany({ data: plan.create.map((t) => ({ ...t, todoId })) });
  }
}

/** Replaces the checklist of a recurring template. */
export async function replaceTemplateTasks(templateId: number, ids: number[]): Promise<void> {
  await db.recurringTemplateTask.deleteMany({ where: { templateId } });
  if (ids.length > 0) {
    await db.recurringTemplateTask.createMany({
      data: ids.map((checklistItemId, sortOrder) => ({ templateId, checklistItemId, sortOrder })),
    });
  }
}
