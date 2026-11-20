import { type NextRequest, NextResponse } from "next/server";
import { ApiError, handleApiError, requireUser } from "@/lib/api";
import { db } from "@/lib/db";
import { applyPlanningFlags, dropDurationMinutes, workdayMinutesFrom } from "@/lib/planning";
import { getSettings } from "@/lib/services/settings";
import { appointmentInputSchema } from "@/lib/schemas/appointments";
import {
  appointmentInclude,
  loadPlanningMeta,
  syncTodoStatus,
  toAppointmentDto,
  toAppointmentDtos,
} from "@/lib/services/appointments";

/** GET /api/appointments?from=ISO&to=ISO — voor de weekkalender. */
export async function GET(request: NextRequest) {
  try {
    await requireUser();
    const sp = request.nextUrl.searchParams;
    const from = sp.get("from");
    const to = sp.get("to");
    if (!from || !to || Number.isNaN(Date.parse(from)) || Number.isNaN(Date.parse(to))) {
      throw new ApiError("Parameters from en to (ISO-datums) zijn verplicht", 400);
    }

    const appointments = await db.appointment.findMany({
      where: {
        startAt: { gte: new Date(from), lt: new Date(to) },
        status: { not: "CANCELLED" },
      },
      include: appointmentInclude,
      orderBy: { startAt: "asc" },
    });
    return NextResponse.json(await toAppointmentDtos(appointments));
  } catch (error) {
    return handleApiError(error);
  }
}

/**
 * POST /api/appointments — plan (part of) a todo at a date + time.
 * Without `durationMinutes` (a drop on the grid) the block gets the todo's
 * remaining time, capped at one working day and at midnight; whatever is
 * left stays in the "in te plannen" sidebar.
 */
export async function POST(request: NextRequest) {
  try {
    await requireUser();
    const input = appointmentInputSchema.parse(await request.json());

    const todo = await db.todo.findUnique({ where: { id: input.todoId } });
    if (!todo) throw new ApiError("Todo niet gevonden", 404);
    if (todo.status === "DONE" || todo.status === "CANCELLED") {
      throw new ApiError("Deze todo is al afgerond of geannuleerd", 409);
    }

    const durationMinutes =
      input.durationMinutes ??
      dropDurationMinutes(
        (await loadPlanningMeta([todo.id])).get(todo.id)?.remainingMinutes ?? 0,
        input.startAt,
        workdayMinutesFrom((await getSettings()).maxBlockHours),
      );

    const created = await db.appointment.create({
      data: {
        todoId: input.todoId,
        startAt: new Date(input.startAt),
        durationMinutes,
        note: input.note,
        ...applyPlanningFlags({ confirmed: false, reservation: false }, input),
      },
      include: appointmentInclude,
    });
    await syncTodoStatus(input.todoId);

    const meta = await loadPlanningMeta([created.todoId]);
    return NextResponse.json(toAppointmentDto(created, meta.get(created.todoId)), { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
