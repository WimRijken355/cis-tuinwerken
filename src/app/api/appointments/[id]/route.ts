import { type NextRequest, NextResponse } from "next/server";
import { ApiError, handleApiError, requireUser } from "@/lib/api";
import { db } from "@/lib/db";
import { appointmentUpdateSchema } from "@/lib/schemas/appointments";
import { applyPlanningFlags } from "@/lib/planning";
import { appointmentInclude, syncTodoStatus, toAppointmentDtos } from "@/lib/services/appointments";
import { isSameBrusselsDay } from "@/lib/time";

async function loadAppointment(params: Promise<{ id: string }>) {
  const id = Number((await params).id);
  if (!Number.isInteger(id) || id <= 0) throw new ApiError("Ongeldig afspraak-id", 400);
  const appointment = await db.appointment.findUnique({ where: { id } });
  if (!appointment) throw new ApiError("Afspraak niet gevonden", 404);
  return appointment;
}

/** GET /api/appointments/:id — één afspraak (voor de registratiepagina). */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requireUser();
    const existing = await loadAppointment(params);
    const full = await db.appointment.findUnique({
      where: { id: existing.id },
      include: appointmentInclude,
    });
    return NextResponse.json((await toAppointmentDtos([full!]))[0]);
  } catch (error) {
    return handleApiError(error);
  }
}

/**
 * PATCH /api/appointments/:id — verplaatsen/verlengen/annuleren, and the
 * "bevestigd"/"reservatie" flags (mutually exclusive, see applyPlanningFlags)
 * and the actual start on site (`arrivedAt`, "Aangekomen" on the Dagplanning).
 * Shortening a block raises the todo's remaining time (it is derived).
 *
 * Herinneringsregel: verschuift de afspraak naar een ándere (Brusselse) dag,
 * dan wordt reminderSentAt gereset zodat de klant een nieuwe, correcte
 * herinnering krijgt. Binnen dezelfde dag blijft de verstuurde herinnering geldig.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requireUser();
    const existing = await loadAppointment(params);
    if (existing.status === "DONE") {
      throw new ApiError("Een afgeronde afspraak kan niet meer aangepast worden", 409);
    }
    const input = appointmentUpdateSchema.parse(await request.json());

    const movedToOtherDay =
      input.startAt !== undefined && !isSameBrusselsDay(existing.startAt, input.startAt);

    const appointment = await db.appointment.update({
      where: { id: existing.id },
      data: {
        ...(input.startAt !== undefined ? { startAt: new Date(input.startAt) } : {}),
        ...(input.durationMinutes !== undefined
          ? { durationMinutes: input.durationMinutes }
          : {}),
        ...(input.note !== undefined ? { note: input.note } : {}),
        ...(input.status !== undefined ? { status: input.status } : {}),
        ...(input.confirmed !== undefined || input.reservation !== undefined
          ? applyPlanningFlags(existing, input)
          : {}),
        ...(input.arrivedAt !== undefined
          ? { arrivedAt: input.arrivedAt === null ? null : new Date(input.arrivedAt) }
          : {}),
        ...(movedToOtherDay ? { reminderSentAt: null, reminderError: null } : {}),
      },
      include: appointmentInclude,
    });
    await syncTodoStatus(appointment.todoId);

    return NextResponse.json((await toAppointmentDtos([appointment]))[0]);
  } catch (error) {
    return handleApiError(error);
  }
}

/**
 * DELETE /api/appointments/:id — afspraak schrappen (uit de planning halen).
 * De todo springt terug naar "in te plannen" als er geen andere afspraken zijn.
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requireUser();
    const existing = await loadAppointment(params);
    if (existing.status === "DONE") {
      throw new ApiError("Een afgeronde afspraak kan niet verwijderd worden", 409);
    }

    await db.appointment.delete({ where: { id: existing.id } });
    await syncTodoStatus(existing.todoId);
    return NextResponse.json({ deleted: true });
  } catch (error) {
    return handleApiError(error);
  }
}
