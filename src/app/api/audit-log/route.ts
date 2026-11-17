import { type NextRequest, NextResponse } from "next/server";
import { handleApiError, requireAdmin } from "@/lib/api";
import { db } from "@/lib/db";
import { auditLogQuerySchema, type AuditLogListResponse } from "@/lib/schemas/audit-log";

/** GET /api/audit-log?table=&action=&page=&pageSize= — overzicht van alle gelogde wijzigingen (ADMIN-only). */
export async function GET(request: NextRequest) {
  try {
    await requireAdmin();
    const { table, action, page, pageSize } = auditLogQuerySchema.parse(
      Object.fromEntries(request.nextUrl.searchParams),
    );

    const where = {
      ...(table ? { tableName: table } : {}),
      ...(action ? { action } : {}),
    };

    const [rows, total] = await Promise.all([
      db.auditLog.findMany({
        where,
        orderBy: { id: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      db.auditLog.count({ where }),
    ]);

    const userIds = [...new Set(rows.map((r) => r.userId).filter((id): id is number => id != null))];
    const users = userIds.length
      ? await db.user.findMany({ where: { id: { in: userIds } }, select: { id: true, username: true } })
      : [];
    const usernameById = new Map(users.map((u) => [u.id, u.username]));

    const response: AuditLogListResponse = {
      items: rows.map((row) => ({
        id: row.id,
        tableName: row.tableName,
        recordId: row.recordId,
        action: row.action,
        userId: row.userId,
        username: row.userId ? (usernameById.get(row.userId) ?? null) : null,
        before: row.before,
        after: row.after,
        createdAt: row.createdAt.toISOString(),
      })),
      total,
      page,
      pageSize,
    };
    return NextResponse.json(response);
  } catch (error) {
    return handleApiError(error);
  }
}
