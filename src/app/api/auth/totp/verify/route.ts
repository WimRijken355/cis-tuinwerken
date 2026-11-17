import { type NextRequest, NextResponse } from "next/server";
import { handleApiError, jsonError } from "@/lib/api";
import { allowAttempt } from "@/lib/auth/rate-limit";
import {
  generateTrustedDeviceToken,
  normalizeRecoveryCode,
  sha256,
  TRUSTED_DEVICE_DAYS,
  verifyTotpCode,
} from "@/lib/auth/totp";
import { db } from "@/lib/db";
import { totpVerifySchema } from "@/lib/schemas/auth";
import { getSession, TRUSTED_DEVICE_COOKIE } from "@/lib/session";

/**
 * Stap 2 van het aanmelden: TOTP-code (of herstelcode) controleren.
 * Bij succes wordt de sessie gepromoveerd naar volledig aangemeld en kan
 * het toestel optioneel 30 dagen vertrouwd worden (cookie + hash in DB).
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session.pendingUserId) {
      return jsonError("Geen lopende aanmelding — log opnieuw in", 400);
    }
    const userId = session.pendingUserId;

    if (!allowAttempt(`totp:${userId}`)) {
      return jsonError("Te veel pogingen. Probeer het over 15 minuten opnieuw.", 429);
    }

    const { code, trustDevice, deviceLabel } = totpVerifySchema.parse(
      await request.json(),
    );

    const user = await db.user.findUnique({ where: { id: userId } });
    if (!user?.totpSecret) {
      return jsonError("2FA is niet ingesteld voor deze gebruiker", 400);
    }

    let valid = await verifyTotpCode(user.totpSecret, code);

    // Geen geldige TOTP-code? Probeer het als herstelcode (eenmalig bruikbaar).
    if (!valid) {
      const recovery = await db.recoveryCode.findFirst({
        where: {
          userId,
          codeHash: sha256(normalizeRecoveryCode(code)),
          usedAt: null,
        },
      });
      if (recovery) {
        await db.recoveryCode.update({
          where: { id: recovery.id },
          data: { usedAt: new Date() },
        });
        valid = true;
      }
    }

    if (!valid) {
      return jsonError("Ongeldige code", 401);
    }

    session.userId = userId;
    session.pendingUserId = undefined;
    session.pendingTotpSecret = undefined;
    await session.save();

    const response = NextResponse.json({ ok: true });

    if (trustDevice) {
      const { token, tokenHash } = generateTrustedDeviceToken();
      const expiresAt = new Date(Date.now() + TRUSTED_DEVICE_DAYS * 24 * 60 * 60 * 1000);
      await db.trustedDevice.create({
        data: { userId, tokenHash, label: deviceLabel ?? null, expiresAt },
      });
      response.cookies.set(TRUSTED_DEVICE_COOKIE, token, {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        expires: expiresAt,
        path: "/",
      });
    }

    return response;
  } catch (error) {
    return handleApiError(error);
  }
}
