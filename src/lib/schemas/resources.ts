import { z } from "zod";
import type { Prisma } from "@/generated/prisma/client";
import { paginationQuerySchema, type Paginated } from "../pagination";

/**
 * Contracts for resources: the people and machines that are planned and
 * invoiced (configured on the "Resources" page).
 */

export const RESOURCE_TYPES = ["PERSON", "MACHINE"] as const;
export type ResourceType = (typeof RESOURCE_TYPES)[number];

/** Dutch UI labels per resource type. */
export const RESOURCE_TYPE_LABELS: Record<ResourceType, string> = {
  PERSON: "Persoon",
  MACHINE: "Machine",
};

export const resourceInputSchema = z.object({
  name: z.string().trim().min(1, "Naam is verplicht").max(100),
  type: z.enum(RESOURCE_TYPES).default("PERSON"),
  hourlyRate: z.coerce.number().min(0, "Tarief kan niet negatief zijn").max(1000),
  active: z.boolean().default(true),
});
export type ResourceInput = z.infer<typeof resourceInputSchema>;

/** PATCH: every field optional, and no defaults (so omitted fields stay unchanged). */
export const resourceUpdateSchema = z.object({
  name: z.string().trim().min(1, "Naam is verplicht").max(100).optional(),
  type: z.enum(RESOURCE_TYPES).optional(),
  hourlyRate: z.coerce.number().min(0, "Tarief kan niet negatief zijn").max(1000).optional(),
  active: z.boolean().optional(),
});

export interface ResourceDto {
  id: number;
  name: string;
  type: ResourceType;
  hourlyRate: number;
  active: boolean;
}

// ---------------------------------------------------------------------------
// List query (GET /api/resources)
// ---------------------------------------------------------------------------

/**
 * Query for GET /api/resources. With `page` the response is paginated
 * (Resources page); without it a plain array (picklists: registration flow,
 * todo form), active only unless `includeInactive=1`.
 */
export const resourceListQuerySchema = paginationQuerySchema.extend({
  name: z
    .string()
    .trim()
    .max(100)
    .optional()
    .transform((v) => v || undefined),
  type: z.preprocess((v) => (v === "" ? undefined : v), z.enum(RESOURCE_TYPES).optional()),
  status: z.enum(["active", "inactive", "all"]).default("all"),
});
export type ResourceListQuery = z.infer<typeof resourceListQuerySchema>;

export type ResourceListResponse = Paginated<ResourceDto>;

/** Prisma `where` for the resource list; all filters are combined with AND. */
export function buildResourceWhere(q: ResourceListQuery): Prisma.ResourceWhereInput {
  return {
    ...(q.name ? { name: { contains: q.name, mode: "insensitive" as const } } : {}),
    ...(q.type ? { type: q.type } : {}),
    ...(q.status === "active" ? { active: true } : q.status === "inactive" ? { active: false } : {}),
  };
}
