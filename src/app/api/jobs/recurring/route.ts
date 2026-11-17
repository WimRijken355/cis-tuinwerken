import { NextResponse } from "next/server";
import { handleApiError, requireUser } from "@/lib/api";
import { runRecurringGenerationJob } from "@/lib/services/recurring";

/**
 * POST /api/jobs/recurring — de generatie van terugkerende todo's handmatig
 * draaien (bv. net na het aanmaken van een sjabloon, of om te testen).
 * Idempotent: bestaande beurten worden nooit gedupliceerd.
 */
export async function POST() {
  try {
    await requireUser();
    const result = await runRecurringGenerationJob();
    return NextResponse.json(result);
  } catch (error) {
    return handleApiError(error);
  }
}
