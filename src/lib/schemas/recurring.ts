import { z } from "zod";
import { checklistItemIdsSchema } from "./checklist";
import { resourcesSchema, type TodoResourceDto } from "./todos";

/** Contracten voor terugkerend werk. */

const windowSchema = z
  .object({
    /** Bestaand window-id bij een update; weglaten = nieuw window. */
    id: z.number().int().positive().optional(),
    label: z.string().trim().min(1).max(50),
    startMonth: z.number().int().min(1).max(12),
    startDay: z.number().int().min(1).max(31).default(1),
    endMonth: z.number().int().min(1).max(12),
    endDay: z.number().int().min(1).max(31).default(31),
    sortOrder: z.number().int().default(0),
  })
  // endMonth < startMonth is toegestaan: het venster loopt over de jaargrens (bv. dec–jan).
  .refine((w) => w.startDay <= 31 && w.endDay <= 31, "Ongeldige dag");

export const recurringTemplateInputSchema = z.object({
  customerId: z.number().int().positive(),
  title: z.string().trim().min(1, "Titel is verplicht").max(200),
  description: z.string().max(5000).optional(),
  estimatedHours: z.coerce.number().positive().max(999),
  /** Zoveel dagen vóór het venster verschijnt de todo als "in te plannen". */
  leadTimeDays: z.coerce.number().int().min(0).max(365).default(30),
  active: z.boolean().default(true),
  windows: z.array(windowSchema).min(1, "Minstens één periode per jaar"),
  /** Resources (with hours) copied onto every generated todo. */
  resources: resourcesSchema.default([]),
  /** Checklist item ids (ordered) copied onto every generated todo. */
  taskIds: checklistItemIdsSchema.default([]),
});
export type RecurringTemplateInput = z.infer<typeof recurringTemplateInputSchema>;

/**
 * PATCH: every field optional and WITHOUT defaults. (`.partial()` on the
 * input schema would keep the defaults, so omitting e.g. `resources` would
 * wipe them and omitting `active` would reactivate the template.)
 */
export const recurringTemplateUpdateSchema = z.object({
  title: z.string().trim().min(1, "Titel is verplicht").max(200).optional(),
  description: z.string().max(5000).optional(),
  estimatedHours: z.coerce.number().positive().max(999).optional(),
  leadTimeDays: z.coerce.number().int().min(0).max(365).optional(),
  active: z.boolean().optional(),
  windows: z.array(windowSchema).min(1, "Minstens één periode per jaar").optional(),
  resources: resourcesSchema.optional(),
  taskIds: checklistItemIdsSchema.optional(),
});
export type RecurringTemplateUpdate = z.infer<typeof recurringTemplateUpdateSchema>;

export interface RecurringWindowDto {
  id: number;
  label: string;
  startMonth: number;
  startDay: number;
  endMonth: number;
  endDay: number;
  sortOrder: number;
}

export interface RecurringTemplateDto {
  id: number;
  customerId: number;
  customerName?: string;
  title: string;
  description: string | null;
  estimatedHours: number;
  leadTimeDays: number;
  active: boolean;
  windows: RecurringWindowDto[];
  resources: TodoResourceDto[];
  tasks: RecurringTaskDto[];
}

export interface RecurringTaskDto {
  checklistItemId: number;
  name: string;
}

/** Prisma `include` for a template's resources and checklist tasks. */
export const recurringExtrasInclude = {
  resources: {
    include: { resource: { select: { name: true, type: true } } },
    orderBy: { id: "asc" as const },
  },
  tasks: {
    include: { checklistItem: { select: { name: true } } },
    orderBy: [{ sortOrder: "asc" as const }, { id: "asc" as const }],
  },
};

/** Maps a template with `recurringExtrasInclude` to its resource + task DTOs. */
export function toRecurringExtrasDto(t: {
  resources: { resourceId: number; hours: unknown; resource: { name: string; type: "PERSON" | "MACHINE" } }[];
  tasks: { checklistItemId: number; checklistItem: { name: string } }[];
}): { resources: TodoResourceDto[]; tasks: RecurringTaskDto[] } {
  return {
    resources: t.resources.map((r) => ({
      resourceId: r.resourceId,
      name: r.resource.name,
      type: r.resource.type,
      hours: Number(r.hours),
    })),
    tasks: t.tasks.map((task) => ({ checklistItemId: task.checklistItemId, name: task.checklistItem.name })),
  };
}

/**
 * Data to copy from a recurring template onto a freshly generated todo:
 * its resources (with hours) and its checklist (name snapshot, in order).
 */
export function generatedTodoExtras(
  todoId: number,
  template: {
    resources: { resourceId: number; hours: unknown }[];
    tasks: { checklistItemId: number; checklistItem: { name: string } }[];
  },
): {
  resources: { todoId: number; resourceId: number; hours: unknown }[];
  tasks: { todoId: number; checklistItemId: number; label: string; sortOrder: number }[];
} {
  return {
    resources: template.resources.map((r) => ({ todoId, resourceId: r.resourceId, hours: r.hours })),
    tasks: template.tasks.map((t, sortOrder) => ({
      todoId,
      checklistItemId: t.checklistItemId,
      label: t.checklistItem.name,
      sortOrder,
    })),
  };
}

export const MONTH_NAMES_NL = [
  "Jan", "Feb", "Mrt", "Apr", "Mei", "Jun",
  "Jul", "Aug", "Sep", "Okt", "Nov", "Dec",
] as const;

/** Automatisch label voor een venster: "Mei" of "Sep–Okt". */
export function windowLabel(startMonth: number, endMonth: number): string {
  return startMonth === endMonth
    ? MONTH_NAMES_NL[startMonth - 1]
    : `${MONTH_NAMES_NL[startMonth - 1]}–${MONTH_NAMES_NL[endMonth - 1]}`;
}
