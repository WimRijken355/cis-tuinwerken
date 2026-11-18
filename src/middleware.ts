import { getIronSession } from "iron-session";
import { NextResponse, type NextRequest } from "next/server";
import { sessionOptions, type SessionData } from "@/lib/session";

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
