import { type NextRequest, NextResponse } from "next/server";
import { handleApiError, jsonError } from "@/lib/api";
import {
  createResetToken,
  identifierWhere,
  isDeliverableEmail,
  passwordResetRequestSchema,
  RESET_REQUESTED_MESSAGE,
  resetLink,
  resetMail,
  resetTokenExpiry,
} from "@/lib/auth/password-reset";
import { allowAttempt } from "@/lib/auth/rate-limit";
import { config } from "@/lib/config";
import { db } from "@/lib/db";
import { sendMail } from "@/lib/services/mailer";

/**
 * POST /api/auth/password-reset/request — public ("Wachtwoord vergeten?").
 * Body `{ identifier }` (username or e-mail). Always answers the same generic
 * message, whether or not the account exists. For an existing user with a
 * real address, earlier open links are revoked and a new one-time link is
 * mailed. Rate-limited per IP.
 */
export async function POST(request: NextRequest) {
  try {
    const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "onbekend";
    if (!allowAttempt(`password-reset:${ip}`)) {
      return jsonError("Te veel pogingen. Probeer het over 15 minuten opnieuw.", 429);
    }
    const { identifier } = passwordResetRequestSchema.parse(await request.json());

    const user = await db.user.findFirst({ where: identifierWhere(identifier) });
    if (user && isDeliverableEmail(user.email)) {
      const { token, tokenHash } = createResetToken();
      await db.passwordResetToken.deleteMany({ where: { userId: user.id, usedAt: null } });
      await db.passwordResetToken.create({
        data: { userId: user.id, tokenHash, expiresAt: resetTokenExpiry() },
      });
      const baseUrl = config().APP_URL ?? request.nextUrl.origin;
      const mail = resetMail(user.username, resetLink(baseUrl, token));
      try {
        await sendMail(user.email, mail.subject, mail.text);
      } catch (error) {
        // Never reveal to the (anonymous) caller whether mailing worked.
        console.error("Password reset mail failed", error);
      }
    }
    return NextResponse.json({ ok: true, message: RESET_REQUESTED_MESSAGE });
  } catch (error) {
    return handleApiError(error);
  }
}
