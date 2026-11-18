import { NextResponse } from "next/server";
import { handleApiError, requireUser } from "@/lib/api";
import { db } from "@/lib/db";
import { appointmentInclude, toAppointmentDtos } from "@/lib/services/appointments";
import { brusselsDayRangeUtc } from "@/lib/time";

/** GET /api/appointments/today — de dagplanning voor het "Vandaag"-scherm. */
export async function GET() {
  try {
    await requireUser();
    const { start, end } = brusselsDayRangeUtc(0);

    const appointments = await db.appointment.findMany({
      where: { startAt: { gte: start, lt: end }, status: { not: "CANCELLED" } },
      include: appointmentInclude,
      orderBy: { startAt: "asc" },
    });
    return NextResponse.json(await toAppointmentDtos(appointments));
  } catch (error) {
    return handleApiError(error);
  }
}
