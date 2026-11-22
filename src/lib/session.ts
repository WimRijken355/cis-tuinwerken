import { getIronSession, type SessionOptions } from "iron-session";
import { cookies } from "next/headers";
import { SESSION_TTL_SECONDS } from "./auth/session-ttl";
import { config } from "./config";

/**
 * Sessie-afhandeling met iron-session: een versleutelde, httpOnly cookie.
 * Er is geen server-side session store nodig — de cookie zélf is de sessie.
 *
 * Twee toestanden:
 * - `pendingUserId`: wachtwoord was juist, maar de TOTP-stap (2FA) is nog
 *   niet afgerond. Geeft GEEN toegang tot de app.
 * - `userId`: volledig aangemeld.
 */
export interface SessionData {
  userId?: number;
  /** Gebruiker die het wachtwoord correct ingaf maar nog 2FA moet doen. */
  pendingUserId?: number;
  /**
   * Tijdelijk TOTP-geheim tijdens de 2FA-setup (tussen QR tonen en bevestigen).
   * Veilig: de hele sessiecookie is versleuteld met SESSION_SECRET.
   */
  pendingTotpSecret?: string;
  /** Epoch ms of the last time the cookie was re-issued (rolling session, see middleware). */
  refreshedAt?: number;
  /**
   * Epoch ms of the 2FA verification this session rests on (a trusted-device
   * login inherits the moment the device was trusted). After MAX_AUTH_AGE_DAYS
   * the session is rejected, see isAuthTooOld().
   */
  twoFactorAt?: number;
}

export const SESSION_COOKIE = "tc_session";
/** Cookie met het token van een vertrouwd toestel (TOTP-stap overslaan). */
export const TRUSTED_DEVICE_COOKIE = "tc_trusted_device";

export function sessionOptions(): SessionOptions {
  return {
    cookieName: SESSION_COOKIE,
    password: config().SESSION_SECRET,
    // 7 days, rolling: the middleware re-saves the session on use (see session-ttl.ts).
    ttl: SESSION_TTL_SECONDS,
    cookieOptions: {
      httpOnly: true,
      sameSite: "lax",
      // In dev draait de app op http://localhost → secure moet dan uit.
      secure: process.env.NODE_ENV === "production",
    },
  };
}

/** De sessie van het huidige request (route handlers / server components). */
export async function getSession() {
  const cookieStore = await cookies();
  return getIronSession<SessionData>(cookieStore, sessionOptions());
}

/** Volledig aangemelde gebruiker of null — voor gebruik in route handlers. */
export async function getAuthenticatedUserId(): Promise<number | null> {
  const session = await getSession();
  return session.userId ?? null;
}
