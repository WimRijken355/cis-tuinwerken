import { z } from "zod";
import { AUDITED_MODELS } from "../audit";

/** Contract voor GET /api/audit-log. */

const tableNames = Array.from(AUDITED_MODELS) as [string, ...string[]];

export const auditLogQuerySchema = z.object({
  table: z.enum(tableNames).optional(),
  action: z.enum(["CREATE", "UPDATE", "DELETE"]).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(50),
});
export type AuditLogQuery = z.infer<typeof auditLogQuerySchema>;

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

export interface AuditLogListResponse {
  items: AuditLogDto[];
  total: number;
  page: number;
  pageSize: number;
}
