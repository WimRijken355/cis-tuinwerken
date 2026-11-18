import { type NextRequest, NextResponse } from "next/server";
import { ApiError, handleApiError, requireUser } from "@/lib/api";
import { loadRegistrationContext } from "@/lib/services/registration";

/**
 * GET /api/appointments/:id/registration — what the "klaarmelden" screen
 * needs: planned resources with an hours proposal, the checklist, whether
 * this is the last block (→ invoice now) and the not yet invoiced earlier days.
 */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireUser();
    const id = Number((await params).id);
    if (!Number.isInteger(id) || id <= 0) throw new ApiError("Ongeldig afspraak-id", 400);
    const context = await loadRegistrationContext(id);
    if (!context) throw new ApiError("Afspraak niet gevonden", 404);
    return NextResponse.json(context);
  } catch (error) {
    return handleApiError(error);
  }
}
