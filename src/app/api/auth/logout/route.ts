import { type NextRequest, NextResponse } from "next/server";
import { handleApiError } from "@/lib/api";
import { forgetTrustedDevice } from "@/lib/auth/trusted-device";
import { getSession, TRUSTED_DEVICE_COOKIE } from "@/lib/session";

/**
 * Afmelden: destroys the session cookie AND forgets this trusted device (DB row
 * + cookie), so the next login always asks for the 2FA code again — whatever
 * is left of the rolling trusted-device period.
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    session.destroy();
    await forgetTrustedDevice(request.cookies.get(TRUSTED_DEVICE_COOKIE)?.value);
    const response = NextResponse.json({ ok: true });
    response.cookies.delete(TRUSTED_DEVICE_COOKIE);
    return response;
  } catch (error) {
    return handleApiError(error);
  }
}
