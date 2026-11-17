import { type NextRequest, NextResponse } from "next/server";
import { ApiError, handleApiError, requireUser } from "@/lib/api";
import { db } from "@/lib/db";
import { appointmentInputSchema } from "@/lib/schemas/appointments";
import { appointmentInclude, syncTodoStatus, toAppointmentDto } from "@/lib/services/appointments";

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
    return NextResponse.json(appointments.map(toAppointmentDto));
  } catch (error) {
    return handleApiError(error);
  }
}

/** POST /api/appointments — todo inplannen op datum + tijd. */
export async function POST(request: NextRequest) {
  try {
    await requireUser();
    const input = appointmentInputSchema.parse(await request.json());

    const todo = await db.todo.findUnique({ where: { id: input.todoId } });
    if (!todo) throw new ApiError("Todo niet gevonden", 404);
    if (todo.status === "DONE" || todo.status === "CANCELLED") {
      throw new ApiError("Deze todo is al afgerond of geannuleerd", 409);
    }

    const appointment = await db.appointment.create({
      data: {
        todoId: input.todoId,
        startAt: new Date(input.startAt),
        durationMinutes: input.durationMinutes,
        note: input.note,
      },
      include: appointmentInclude,
    });
    await syncTodoStatus(input.todoId);

    return NextResponse.json(toAppointmentDto(appointment), { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
