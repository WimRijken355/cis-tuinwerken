import { NextResponse } from "next/server";
import { handleApiError, requireUser } from "@/lib/api";
import { runReminderJob } from "@/lib/services/reminders";

/**
 * POST /api/jobs/reminders — de reminder-job handmatig draaien
 * (test-/beheerknop op de instellingenpagina; negeert het ingestelde uur).
 */
export async function POST() {
  try {
    await requireUser();
    const result = await runReminderJob();
    return NextResponse.json(result);
  } catch (error) {
    return handleApiError(error);
  }
}
