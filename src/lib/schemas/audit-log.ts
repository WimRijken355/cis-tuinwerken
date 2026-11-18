import { DateTime } from "luxon";
import { z } from "zod";
import type { Prisma } from "@/generated/prisma/client";
import { AUDITED_MODELS } from "../audit";
import type { Paginated } from "../pagination";
import { ZONE } from "../time";

/** Contract voor GET /api/audit-log. */

const tableNames = Array.from(AUDITED_MODELS) as [string, ...string[]];

const emptyToUndefined = (v: unknown) => (v === "" ? undefined : v);
const isoDate = z.preprocess(
  emptyToUndefined,
  z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Datum als jjjj-mm-dd")
    .optional(),
);

export const auditLogQuerySchema = z.object({
  table: z.preprocess(emptyToUndefined, z.enum(tableNames).optional()),
  action: z.preprocess(emptyToUndefined, z.enum(["CREATE", "UPDATE", "DELETE"]).optional()),
  /** A user id, or "system" for changes made by background jobs (userId NULL). */
  user: z.preprocess(
    emptyToUndefined,
    z.union([z.literal("system"), z.coerce.number().int().positive()]).optional(),
  ),
  recordId: z.preprocess(emptyToUndefined, z.string().trim().max(50).optional()),
  /** Inclusive day range (yyyy-MM-dd), interpreted in Europe/Brussels. */
  from: isoDate,
  to: isoDate,
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(50),
});
export type AuditLogQuery = z.infer<typeof auditLogQuerySchema>;

/** Prisma `where` for the audit log; all filters are combined with AND. */
export function buildAuditLogWhere(q: AuditLogQuery): Prisma.AuditLogWhereInput {
  const createdAt: { gte?: Date; lt?: Date } = {};
  if (q.from) createdAt.gte = DateTime.fromISO(q.from, { zone: ZONE }).startOf("day").toJSDate();
  if (q.to) createdAt.lt = DateTime.fromISO(q.to, { zone: ZONE }).plus({ days: 1 }).startOf("day").toJSDate();

  return {
    ...(q.table ? { tableName: q.table } : {}),
    ...(q.action ? { action: q.action } : {}),
    ...(q.user === "system" ? { userId: null } : q.user !== undefined ? { userId: q.user } : {}),
    ...(q.recordId ? { recordId: q.recordId } : {}),
    ...(q.from || q.to ? { createdAt } : {}),
  };
}

/**
 * Top-level fields whose value differs between `before` and `after`
 * (for UPDATE rows; empty when either side is missing). `updatedAt` is
 * ignored because it changes on every update.
 */
export function changedFields(before: unknown, after: unknown): string[] {
  if (!isRecord(before) || !isRecord(after)) return [];
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  return [...keys].filter(
    (k) => k !== "updatedAt" && JSON.stringify(before[k]) !== JSON.stringify(after[k]),
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export interface AuditLogDto {
  id: number;
  tableName: string;
  recordId: string;
  action: "CREATE" | "UPDATE" | "DELETE";
  userId: number | null;
  username: string | null;
  before: unknown;
  after: unknown;
  createdAt: string;
}

export type AuditLogListResponse = Paginated<AuditLogDto>;
