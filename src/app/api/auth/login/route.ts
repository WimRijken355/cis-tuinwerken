import bcrypt from "bcryptjs";
import { type NextRequest, NextResponse } from "next/server";
import { handleApiError, jsonError } from "@/lib/api";
import { allowAttempt, clearAttempts } from "@/lib/auth/rate-limit";
import { sha256 } from "@/lib/auth/totp";
import { db } from "@/lib/db";
import { loginSchema } from "@/lib/schemas/auth";
import { getSession, TRUSTED_DEVICE_COOKIE } from "@/lib/session";

/**
 * Stap 1 van het aanmelden: gebruikersnaam + wachtwoord.
 *
 * Mogelijke uitkomsten:
 * - { ok: true }            → volledig aangemeld (toestel was vertrouwd)
 * - { needsTotp: true }     → wachtwoord juist, TOTP-code vereist
 * - { needsTotpSetup: true }→ wachtwoord juist, maar 2FA moet eerst ingesteld worden
 */
export async function POST(request: NextRequest) {
  try {
    const ip =
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "onbekend";
    if (!allowAttempt(`login:${ip}`)) {
      return jsonError("Te veel pogingen. Probeer het over 15 minuten opnieuw.", 429);
    }

    const { username, password } = loginSchema.parse(await request.json());

    const user = await db.user.findUnique({ where: { username } });
    // Altijd dezelfde generieke fout — verklapt niet of de gebruikersnaam bestaat.
    if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
      return jsonError("Ongeldige gebruikersnaam of wachtwoord", 401);
    }

    clearAttempts(`login:${ip}`);
    const session = await getSession();

    // 2FA nog niet ingesteld → verplicht eerst de setup doorlopen.
    if (!user.totpSecret) {
      session.pendingUserId = user.id;
      session.userId = undefined;
      await session.save();
      return NextResponse.json({ ok: false, needsTotpSetup: true });
    }

    // Vertrouwd toestel? Dan mag de TOTP-stap overgeslagen worden.
    const deviceToken = request.cookies.get(TRUSTED_DEVICE_COOKIE)?.value;
    if (deviceToken) {
      const device = await db.trustedDevice.findUnique({
        where: { tokenHash: sha256(deviceToken) },
      });
      if (device && device.userId === user.id && device.expiresAt > new Date()) {
        await db.trustedDevice.update({
          where: { id: device.id },
          data: { lastUsedAt: new Date() },
        });
        session.userId = user.id;
        session.pendingUserId = undefined;
        await session.save();
        return NextResponse.json({ ok: true });
      }
    }

    session.pendingUserId = user.id;
    session.userId = undefined;
    await session.save();
    return NextResponse.json({ ok: false, needsTotp: true });
  } catch (error) {
    return handleApiError(error);
  }
}
