import { NextResponse } from "next/server";
import QRCode from "qrcode";
import { handleApiError, jsonError } from "@/lib/api";
import { generateTotpSetup } from "@/lib/auth/totp";
import { db } from "@/lib/db";
import { getSession } from "@/lib/session";

/**
 * Start de 2FA-setup: genereert een TOTP-geheim en geeft een QR-code terug
 * om te scannen met een authenticator-app (Google/Microsoft Authenticator, ...).
 *
 * Toegankelijk voor:
 * - een pending login (eerste keer, 2FA nog niet ingesteld)
 * - een aangemelde gebruiker (2FA opnieuw instellen vanuit Instellingen)
 *
 * Het geheim wordt pas in de database bewaard na bevestiging met een geldige
 * code (zie /api/auth/totp/confirm); tot dan leeft het alleen in de
 * versleutelde sessiecookie.
 */
export async function POST() {
  try {
    const session = await getSession();
    const userId = session.userId ?? session.pendingUserId;
    if (!userId) {
      return jsonError("Niet aangemeld", 401);
    }

    const user = await db.user.findUnique({ where: { id: userId } });
    if (!user) {
      return jsonError("Gebruiker niet gevonden", 404);
    }

    const { secret, otpauthUrl } = generateTotpSetup(user.username);
    session.pendingTotpSecret = secret;
    await session.save();

    const qrDataUrl = await QRCode.toDataURL(otpauthUrl, { width: 240, margin: 1 });

    return NextResponse.json({
      otpauthUrl, // voor wie het geheim handmatig wil intikken
      qrDataUrl, // <img src=...> op de setup-pagina
    });
  } catch (error) {
    return handleApiError(error);
  }
}
