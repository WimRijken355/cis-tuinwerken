import { NextResponse } from "next/server";
import { handleApiError } from "@/lib/api";
import { getSession } from "@/lib/session";

/**
 * Afmelden: vernietigt de sessiecookie.
 * De "vertrouwd toestel"-cookie blijft bewust staan — bij de volgende login
 * is dan alleen het wachtwoord nodig, geen TOTP-code.
 */
export async function POST() {
  try {
    const session = await getSession();
    session.destroy();
    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}
