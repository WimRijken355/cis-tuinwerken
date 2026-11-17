import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { setAuditUser } from "./audit-context";
import { db } from "./db";
import { getSession } from "./session";

/**
 * Hulpfuncties voor route handlers: uniforme foutvorm en auth-guard.
 * Foutvorm: { error: string } met passende HTTP-status.
 */

export function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

/** Gegooid door guards; wordt door `handleApiError` omgezet naar een nette respons. */
export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

/**
 * Guard voor beveiligde endpoints: geeft de userId terug of gooit een 401.
 * De middleware weert anonieme bezoekers al van de pagina's, maar élk
 * API-endpoint controleert zelf opnieuw — defense in depth.
 */
export async function requireUser(): Promise<number> {
  const session = await getSession();
  if (!session.userId) {
    throw new ApiError("Niet aangemeld", 401);
  }
  setAuditUser(session.userId);
  return session.userId;
}

/**
 * Guard for ADMIN-only endpoints (user management, audit trail): returns
 * the userId if the signed-in user is ADMIN, otherwise throws a 403.
 */
export async function requireAdmin(): Promise<number> {
  const userId = await requireUser();
  const user = await db.user.findUnique({ where: { id: userId }, select: { role: true } });
  if (user?.role !== "ADMIN") {
    throw new ApiError("Geen toegang — enkel voor beheerders", 403);
  }
  return userId;
}

/** Standaard catch-afhandeling voor route handlers. */
export function handleApiError(error: unknown) {
  if (error instanceof ApiError) {
    return jsonError(error.message, error.status);
  }
  if (error instanceof ZodError) {
    const details = error.issues
      .map((i) => (i.path.length ? `${i.path.join(".")}: ${i.message}` : i.message))
      .join("; ");
    return jsonError(`Ongeldige invoer — ${details}`, 400);
  }
  console.error("Onverwachte API-fout:", error);
  return jsonError("Er ging iets mis op de server", 500);
}
