import { z } from "zod";
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

const resourcesSchema = z
  .array(todoResourceInputSchema)
  .max(50)
  .refine(
    (list) => new Set(list.map((r) => r.resourceId)).size === list.length,
    "Elke resource kan maar één keer per todo voorkomen",
  );

export const todoInputSchema = z.object({
  customerId: z.number().int().positive(),
  title: z.string().trim().min(1, "Titel is verplicht").max(200),
  description: z.string().max(5000).optional(),
  /** Total estimated time of the job. */
  estimatedHours: hoursField("Geschatte uren"),
  resources: resourcesSchema.default([]),
});
export type TodoInput = z.infer<typeof todoInputSchema>;

/** PATCH: `resources`, when given, replaces the whole set (empty array = none). */
export const todoUpdateSchema = z.object({
  title: z.string().trim().min(1, "Titel is verplicht").max(200).optional(),
  description: z.string().max(5000).optional(),
  estimatedHours: hoursField("Geschatte uren").optional(),
  resources: resourcesSchema.optional(),
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
  customerId: number;
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
}

/** Prisma `include` for a todo's resources, shared by all todo endpoints. */
export const todoResourcesInclude = {
  resources: {
    include: { resource: { select: { name: true, type: true } } },
    orderBy: { id: "asc" as const },
  },
};

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
