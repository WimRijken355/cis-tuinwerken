import { z } from "zod";
import { checklistItemIdsSchema } from "./checklist";
import type { ResourceType } from "./resources";

/** Contracten voor /api/todos. */

const hoursField = (label: string) =>
  z.coerce
    .number()
    .positive(`${label} moeten groter dan 0 zijn`)
    .max(999, `${label} zijn onrealistisch hoog`)
    // Stored as Decimal(5,2).
    .transform((v) => Math.round(v * 100) / 100);

/**
 * Planned resource for a todo: how many hours of this person/machine are
 * needed. Independent of the todo's total estimate — the sum does not have
 * to match (e.g. a machine running in parallel with two people).
 */
export const todoResourceInputSchema = z.object({
  resourceId: z.number().int().positive(),
  hours: hoursField("Uren per resource"),
});
export type TodoResourceInput = z.infer<typeof todoResourceInputSchema>;

export const resourcesSchema = z
  .array(todoResourceInputSchema)
  .max(50)
  .refine(
    (list) => new Set(list.map((r) => r.resourceId)).size === list.length,
    "Elke resource kan maar één keer per todo voorkomen",
  );

export const todoInputSchema = z.object({
  /** null/omitted = "losse todo" (holiday, doctor, ...): no customer, never invoiced. */
  customerId: z.number().int().positive().nullable().default(null),
  title: z.string().trim().min(1, "Titel is verplicht").max(200),
  description: z.string().max(5000).optional(),
  /** Total estimated time of the job. */
  estimatedHours: hoursField("Geschatte uren"),
  resources: resourcesSchema.default([]),
  /** Checklist item ids (ordered) that make up this todo's checklist. */
  taskIds: checklistItemIdsSchema.default([]),
});
export type TodoInput = z.infer<typeof todoInputSchema>;

/**
 * PATCH: `resources` / `taskIds`, when given, replace the whole set (empty
 * array = none). Tasks that stay keep their "done" state.
 */
export const todoUpdateSchema = z.object({
  title: z.string().trim().min(1, "Titel is verplicht").max(200).optional(),
  description: z.string().max(5000).optional(),
  estimatedHours: hoursField("Geschatte uren").optional(),
  resources: resourcesSchema.optional(),
  taskIds: checklistItemIdsSchema.optional(),
  status: z.enum(["OPEN", "PLANNED", "DONE", "CANCELLED"]).optional(),
});
export type TodoUpdate = z.infer<typeof todoUpdateSchema>;

export interface TodoResourceDto {
  resourceId: number;
  name: string;
  type: ResourceType;
  hours: number;
}

export interface TodoDto {
  id: number;
  /** null for a "losse todo". */
  customerId: number | null;
  customerName?: string;
  title: string;
  description: string | null;
  /** Als number geserialiseerd (Prisma Decimal → number in de API-laag). */
  estimatedHours: number;
  status: "OPEN" | "PLANNED" | "DONE" | "CANCELLED";
  completedAt: string | null;
  /** Gezet voor todo's die uit terugkerend werk gegenereerd zijn. */
  recurringWindowId: number | null;
  windowStart: string | null;
  windowEnd: string | null;
  windowLabel?: string | null;
  /** Planned resources (persons/machines) with hours per resource. */
  resources?: TodoResourceDto[];
  /** Checklist of tasks to carry out, in order. */
  tasks?: TodoTaskDto[];
  /** Planning: minutes already planned in blocks / still to plan (GET /api/todos). */
  plannedMinutes?: number;
  remainingMinutes?: number;
  appointmentCount?: number;
}

export interface TodoTaskDto {
  id: number;
  checklistItemId: number | null;
  label: string;
  done: boolean;
}

/** Body for PATCH /api/todos/:id/tasks/:taskId. */
export const todoTaskToggleSchema = z.object({ done: z.boolean() });

/** Prisma `include` for a todo's resources and checklist, shared by all todo endpoints. */
export const todoResourcesInclude = {
  resources: {
    include: { resource: { select: { name: true, type: true } } },
    orderBy: { id: "asc" as const },
  },
  tasks: { orderBy: [{ sortOrder: "asc" as const }, { id: "asc" as const }] },
};

/** Maps TodoTask rows to DTOs. */
export function toTodoTaskDtos(
  rows: { id: number; checklistItemId: number | null; label: string; done: boolean }[],
): TodoTaskDto[] {
  return rows.map(({ id, checklistItemId, label, done }) => ({ id, checklistItemId, label, done }));
}

export interface TaskSyncPlan {
  deleteIds: number[];
  create: { checklistItemId: number; label: string; sortOrder: number }[];
  updateSortOrder: { id: number; sortOrder: number }[];
}

/**
 * Turns the desired ordered list of checklist item ids into the changes on a
 * todo's existing tasks: tasks that stay keep their row (and so their
 * "done" state) and only get a new position; removed ones are deleted; new
 * ones are created with the current name of the checklist item as snapshot.
 */
export function planTodoTaskSync(
  existing: { id: number; checklistItemId: number | null; sortOrder: number }[],
  desiredIds: number[],
  namesById: Map<number, string>,
): TaskSyncPlan {
  const byItemId = new Map(
    existing.filter((t) => t.checklistItemId !== null).map((t) => [t.checklistItemId as number, t]),
  );
  const desired = new Set(desiredIds);
  const plan: TaskSyncPlan = {
    deleteIds: existing
      .filter((t) => t.checklistItemId === null || !desired.has(t.checklistItemId))
      .map((t) => t.id),
    create: [],
    updateSortOrder: [],
  };
  desiredIds.forEach((itemId, sortOrder) => {
    const current = byItemId.get(itemId);
    if (current) {
      if (current.sortOrder !== sortOrder) plan.updateSortOrder.push({ id: current.id, sortOrder });
    } else {
      plan.create.push({ checklistItemId: itemId, label: namesById.get(itemId) ?? "Taak", sortOrder });
    }
  });
  return plan;
}

/** Maps the included TodoResource rows to DTOs (Decimal → number). */
export function toTodoResourceDtos(
  rows: { resourceId: number; hours: unknown; resource: { name: string; type: ResourceType } }[],
): TodoResourceDto[] {
  return rows.map((r) => ({
    resourceId: r.resourceId,
    name: r.resource.name,
    type: r.resource.type,
    hours: Number(r.hours),
  }));
}

/** Sum of the hours planned per resource (shown next to the total estimate). */
export function sumResourceHours(resources: { hours: number }[]): number {
  return Math.round(resources.reduce((sum, r) => sum + r.hours, 0) * 100) / 100;
}
