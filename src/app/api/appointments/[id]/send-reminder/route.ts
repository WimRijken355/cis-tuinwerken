import { type NextRequest, NextResponse } from "next/server";
import { ApiError, handleApiError, requireUser } from "@/lib/api";
import { db } from "@/lib/db";
import { sendReminderForAppointment } from "@/lib/services/reminders";

/**
 * POST /api/appointments/:id/send-reminder
 * Handmatig een herinnering (opnieuw) versturen — bv. na een eerdere fout of
 * voor een afspraak later deze week.
 */
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requireUser();
    const id = Number((await params).id);
    const appointment = await db.appointment.findUnique({
      where: { id },
      include: { todo: { include: { customer: { select: { name: true, email: true } } } } },
    });
    if (!appointment) throw new ApiError("Afspraak niet gevonden", 404);
    if (appointment.status !== "PLANNED") {
      throw new ApiError("Alleen voor geplande afspraken", 409);
    }
    if (!appointment.todo.customer.email) {
      throw new ApiError(
        `${appointment.todo.customer.name} heeft geen e-mailadres. Vul dit eerst aan op de klantfiche.`,
        400,
      );
    }

    const ok = await sendReminderForAppointment(id);
    if (!ok) {
      const updated = await db.appointment.findUnique({ where: { id } });
      throw new ApiError(updated?.reminderError ?? "Versturen mislukt", 502);
    }
    return NextResponse.json({ sent: true });
  } catch (error) {
    return handleApiError(error);
  }
}
