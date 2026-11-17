import { type NextRequest, NextResponse } from "next/server";
import { handleApiError, jsonError } from "@/lib/api";
import {
  encryptSecret,
  generateRecoveryCodes,
  sha256,
  verifyTotpCodeAgainstPlainSecret,
} from "@/lib/auth/totp";
import { db } from "@/lib/db";
import { totpConfirmSchema } from "@/lib/schemas/auth";
import { getSession } from "@/lib/session";

/**
 * Rondt de 2FA-setup af: controleert de eerste code uit de authenticator-app,
 * bewaart het geheim (versleuteld), maakt nieuwe herstelcodes aan en meldt
 * de gebruiker volledig aan.
 *
 * De herstelcodes worden exact één keer als plaintext teruggegeven —
 * daarna bestaan alleen nog de hashes.
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    const userId = session.userId ?? session.pendingUserId;
    if (!userId || !session.pendingTotpSecret) {
      return jsonError("Geen lopende 2FA-setup", 400);
    }

    const { code } = totpConfirmSchema.parse(await request.json());

    if (!(await verifyTotpCodeAgainstPlainSecret(session.pendingTotpSecret, code))) {
      return jsonError("Ongeldige code. Controleer je authenticator-app.", 401);
    }

    const recoveryCodes = generateRecoveryCodes();

    await db.$transaction([
      db.user.update({
        where: { id: userId },
        data: {
          totpSecret: encryptSecret(session.pendingTotpSecret),
          totpEnabledAt: new Date(),
        },
      }),
      // Oude herstelcodes en vertrouwde toestellen vervallen bij een nieuwe setup.
      db.recoveryCode.deleteMany({ where: { userId } }),
      db.trustedDevice.deleteMany({ where: { userId } }),
      db.recoveryCode.createMany({
        data: recoveryCodes.map((c) => ({ userId, codeHash: sha256(c) })),
      }),
    ]);

    session.userId = userId;
    session.pendingUserId = undefined;
    session.pendingTotpSecret = undefined;
    await session.save();

    return NextResponse.json({ ok: true, recoveryCodes });
  } catch (error) {
    return handleApiError(error);
  }
}
