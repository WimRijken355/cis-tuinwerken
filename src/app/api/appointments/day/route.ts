import { type NextRequest, NextResponse } from "next/server";
import { ApiError, handleApiError, requireUser } from "@/lib/api";
import { db } from "@/lib/db";
import { appointmentInclude, toAppointmentDtos } from "@/lib/services/appointments";
import { brusselsDayRangeForDate, isIsoDay, todayBrussels } from "@/lib/time";

/**
 * GET /api/appointments/day?date=yyyy-MM-dd — all blocks of one Brussels day
 * for the Dagplanning screen (default: today).
 */
export async function GET(request: NextRequest) {
  try {
    await requireUser();
    const date = request.nextUrl.searchParams.get("date") ?? todayBrussels();
    if (!isIsoDay(date)) throw new ApiError("Ongeldige datum (verwacht jjjj-mm-dd)", 400);
    const { start, end } = brusselsDayRangeForDate(date);

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
