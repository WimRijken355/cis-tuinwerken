import { type NextRequest, NextResponse } from "next/server";
import { ApiError, handleApiError, jsonError, requireAdmin } from "@/lib/api";
import { getAuditUserId } from "@/lib/audit-context";
import { db } from "@/lib/db";
import { toUserDto, updateUserRoleSchema } from "@/lib/schemas/users";
import { wouldRemoveLastAdmin } from "@/lib/users-guard";

async function parseId(params: Promise<{ id: string }>): Promise<number> {
  const id = Number((await params).id);
  if (!Number.isInteger(id) || id <= 0) {
    throw new ApiError("Ongeldig gebruikers-id", 400);
  }
  return id;
}

/** PATCH /api/users/:id — rol wijzigen (ADMIN-only). */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireAdmin();
    const id = await parseId(params);
    const { role } = updateUserRoleSchema.parse(await request.json());

    const target = await db.user.findUnique({ where: { id } });
    if (!target) throw new ApiError("Gebruiker niet gevonden", 404);

    if (target.role !== role) {
      const adminCount = await db.user.count({ where: { role: "ADMIN" } });
      if (
        wouldRemoveLastAdmin({
          adminCount,
          targetIsCurrentlyAdmin: target.role === "ADMIN",
          targetWillBeAdmin: role === "ADMIN",
        })
      ) {
        return jsonError(
          "Kan de laatste beheerder niet degraderen — ken eerst een andere gebruiker de rol beheerder toe.",
          400,
        );
      }
    }

    const updated = await db.user.update({ where: { id }, data: { role } });

    if (target.role !== role) {
      await db.auditLog.create({
        data: {
          tableName: "User",
          recordId: String(id),
          action: "UPDATE",
          userId: getAuditUserId(),
          before: { username: target.username, role: target.role },
          after: { username: updated.username, role: updated.role },
        },
      });
    }

    return NextResponse.json(toUserDto(updated));
  } catch (error) {
    return handleApiError(error);
  }
}

/** DELETE /api/users/:id — gebruiker verwijderen (ADMIN-only). */
export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const adminId = await requireAdmin();
    const id = await parseId(params);

    if (id === adminId) {
      return jsonError("Je kan je eigen account niet verwijderen", 400);
    }

    const target = await db.user.findUnique({ where: { id } });
    if (!target) throw new ApiError("Gebruiker niet gevonden", 404);

    if (target.role === "ADMIN") {
      const adminCount = await db.user.count({ where: { role: "ADMIN" } });
      if (wouldRemoveLastAdmin({ adminCount, targetIsCurrentlyAdmin: true, targetWillBeAdmin: false })) {
        return jsonError(
          "Kan de laatste beheerder niet verwijderen — ken eerst een andere gebruiker de rol beheerder toe.",
          400,
        );
      }
    }

    await db.user.delete({ where: { id } });

    await db.auditLog.create({
      data: {
        tableName: "User",
        recordId: String(id),
        action: "DELETE",
        userId: getAuditUserId(),
        before: { username: target.username, role: target.role },
      },
    });

    return NextResponse.json({ deleted: true });
  } catch (error) {
    return handleApiError(error);
  }
}
