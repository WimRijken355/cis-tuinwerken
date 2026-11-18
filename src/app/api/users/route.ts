import bcrypt from "bcryptjs";
import { type NextRequest, NextResponse } from "next/server";
import { handleApiError, jsonError, requireAdmin } from "@/lib/api";
import { getAuditUserId } from "@/lib/audit-context";
import { db } from "@/lib/db";
import { createUserSchema, toUserDto } from "@/lib/schemas/users";

/** GET /api/users — list of all users (ADMIN-only). */
export async function GET() {
  try {
    await requireAdmin();
    const users = await db.user.findMany({ orderBy: { username: "asc" } });
    return NextResponse.json(users.map(toUserDto));
  } catch (error) {
    return handleApiError(error);
  }
}

/**
 * POST /api/users — create a new user (ADMIN-only).
 *
 * User is excluded from the automatic audit trail (src/lib/audit.ts) to
 * avoid logging password hashes/2FA secrets, so this writes its own,
 * redacted AuditLog entry (username, e-mail and role only).
 */
export async function POST(request: NextRequest) {
  try {
    await requireAdmin();
    const input = createUserSchema.parse(await request.json());

    if (await db.user.findUnique({ where: { username: input.username } })) {
      return jsonError("Deze gebruikersnaam bestaat al", 409);
    }
    if (await db.user.findUnique({ where: { email: input.email } })) {
      return jsonError("Dit e-mailadres wordt al gebruikt", 409);
    }

    const user = await db.user.create({
      data: {
        username: input.username,
        email: input.email,
        passwordHash: await bcrypt.hash(input.password, 12),
        role: input.role,
      },
    });

    await db.auditLog.create({
      data: {
        tableName: "User",
        recordId: String(user.id),
        action: "CREATE",
        userId: getAuditUserId(),
        after: { username: user.username, email: user.email, role: user.role },
      },
    });

    return NextResponse.json(toUserDto(user), { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
