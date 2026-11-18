import bcrypt from "bcryptjs";
import { type NextRequest, NextResponse } from "next/server";
import { handleApiError, jsonError } from "@/lib/api";
import {
  hashResetToken,
  isResetTokenUsable,
  passwordResetConfirmSchema,
  RESET_LINK_INVALID_MESSAGE,
} from "@/lib/auth/password-reset";
import { allowAttempt } from "@/lib/auth/rate-limit";
import { db } from "@/lib/db";
import { getSession } from "@/lib/session";

/**
 * POST /api/auth/password-reset/confirm — public. Body `{ token, password,
 * confirmPassword }`. Sets the new password and resets 2FA completely (TOTP
 * secret, recovery codes, trusted devices), so the next login goes through
 * the 2FA setup. The link is single-use; all open links of the user are revoked.
 */
export async function POST(request: NextRequest) {
  try {
    const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "onbekend";
    if (!allowAttempt(`password-reset-confirm:${ip}`)) {
      return jsonError("Te veel pogingen. Probeer het over 15 minuten opnieuw.", 429);
    }
    const { token, password } = passwordResetConfirmSchema.parse(await request.json());

    const resetToken = await db.passwordResetToken.findUnique({
      where: { tokenHash: hashResetToken(token) },
      include: { user: { select: { id: true, username: true } } },
    });
    if (!resetToken || !isResetTokenUsable(resetToken)) {
      return jsonError(RESET_LINK_INVALID_MESSAGE, 400);
    }
    const userId = resetToken.userId;
    const passwordHash = await bcrypt.hash(password, 12);

    await db.$transaction([
      db.user.update({
        where: { id: userId },
        data: { passwordHash, totpSecret: null, totpEnabledAt: null },
      }),
      db.recoveryCode.deleteMany({ where: { userId } }),
      db.trustedDevice.deleteMany({ where: { userId } }),
      db.passwordResetToken.update({ where: { id: resetToken.id }, data: { usedAt: new Date() } }),
      db.passwordResetToken.deleteMany({ where: { userId, usedAt: null } }),
      // User is not in the automatic audit trail (secrets): redacted entry.
      db.auditLog.create({
        data: {
          tableName: "User",
          recordId: String(userId),
          action: "UPDATE",
          userId: null,
          after: { username: resetToken.user.username, event: "Wachtwoord + 2FA gereset via e-maillink" },
        },
      }),
    ]);

    // Whatever session this browser had is no longer valid.
    const session = await getSession();
    session.destroy();

    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}
