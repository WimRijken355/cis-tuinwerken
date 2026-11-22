import { getIronSession } from "iron-session";
import { NextResponse, type NextRequest } from "next/server";
import { isAuthTooOld, shouldRefreshSession } from "@/lib/auth/session-ttl";
import { SESSION_COOKIE, sessionOptions, type SessionData } from "@/lib/session";

/**
 * Toegangscontrole op pagina-niveau: wie geen geldige (volledig aangemelde)
 * sessie heeft, wordt naar /login gestuurd. De sessiecookie wordt hier echt
 * ontsleuteld en gecontroleerd — niet alleen op aanwezigheid.
 *
 * API-routes handelen hun eigen 401 af (zie requireUser in lib/api.ts),
 * zodat fetch-aanroepen een nette JSON-fout krijgen in plaats van een redirect.
 */

const PUBLIC_PATHS = ["/login", "/forgot-password", "/reset-password"];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
    return NextResponse.next();
  }

  const response = NextResponse.next();
  const session = await getIronSession<SessionData>(request, response, sessionOptions());

  if (!session.userId) {
    const loginUrl = new URL("/login", request.url);
    return NextResponse.redirect(loginUrl);
  }

  const now = Date.now();

  // Hard limit: ± 6 months after the last 2FA a full login is required again.
  if (isAuthTooOld(session.twoFactorAt, now)) {
    const redirect = NextResponse.redirect(new URL("/login", request.url));
    redirect.cookies.delete(SESSION_COOKIE);
    return redirect;
  }

  // Rolling session: re-issue the cookie (restarting its 7-day TTL) on use,
  // at most once per SESSION_REFRESH_INTERVAL_MS. Sessions from before the
  // 6-month rule start counting now.
  if (shouldRefreshSession(session.refreshedAt, now) || session.twoFactorAt === undefined) {
    session.refreshedAt = now;
    session.twoFactorAt ??= now;
    await session.save();
  }

  return response;
}

export const config = {
  matcher: [
    /*
     * Alles behalve:
     * - /api (regelt zelf 401's)
     * - Next.js internals en statische bestanden
     */
    "/((?!api|_next/static|_next/image|favicon.ico|icon.png|apple-icon.png|icons|manifest.webmanifest|sw.js|serwist).*)",
  ],
};
