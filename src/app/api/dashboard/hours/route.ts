import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { handleApiError, requireUser } from "@/lib/api";
import { allocatePlannedHours, type HoursEntry } from "@/lib/dashboard";
import { db } from "@/lib/db";
import { brusselsDayRangeForDate, isIsoDay, toBrussels } from "@/lib/time";

const querySchema = z.object({
  metric: z.enum(["planned", "registered", "invoiced"]),
  from: z.string().refine(isIsoDay, "Ongeldige datum"),
  to: z.string().refine(isIsoDay, "Ongeldige datum"),
  /** planned only: also count losse todo's (vakantie, dokter, …). */
  loose: z.enum(["0", "1"]).default("0"),
});

export interface DashboardHoursResponse {
  resources: { id: number; name: string; type: "PERSON" | "MACHINE"; active: boolean }[];
  entries: HoursEntry[];
}

/**
 * GET /api/dashboard/hours?metric=planned|registered|invoiced&from=&to=&loose=0|1
 * Hours per resource per Brussels day in [from, to] (inclusive):
 * - planned: non-cancelled blocks, allocated per resource with
 *   allocatePlannedHours() (needs all blocks of the todo, also outside the range)
 * - registered / invoiced: LaborEntry.registeredHours / invoicedHours, on the
 *   day of the registered block
 */
export async function GET(request: NextRequest) {
  try {
    await requireUser();
    const q = querySchema.parse(Object.fromEntries(request.nextUrl.searchParams));
    const start = brusselsDayRangeForDate(q.from).start;
    const end = brusselsDayRangeForDate(q.to).end;
    const inRange = (day: string) => day >= q.from && day <= q.to;

    const resources = await db.resource.findMany({ orderBy: { id: "asc" } });
    let entries: HoursEntry[];

    if (q.metric === "planned") {
      const todos = await db.todo.findMany({
        where: {
          ...(q.loose === "1" ? {} : { customerId: { not: null } }),
          appointments: { some: { status: { not: "CANCELLED" }, startAt: { gte: start, lt: end } } },
        },
        select: {
          appointments: { where: { status: { not: "CANCELLED" } }, select: { startAt: true, durationMinutes: true } },
          resources: { select: { resourceId: true, hours: true } },
        },
      });
      entries = allocatePlannedHours(
        todos.map((t) => ({
          appointments: t.appointments,
          resources: t.resources.map((r) => ({ resourceId: r.resourceId, hours: Number(r.hours) })),
        })),
      ).filter((e) => inRange(e.day));
    } else {
      const labor = await db.laborEntry.findMany({
        where: { resourceId: { not: null }, completion: { appointment: { startAt: { gte: start, lt: end } } } },
        select: {
          resourceId: true,
          registeredHours: true,
          invoicedHours: true,
          completion: { select: { appointment: { select: { startAt: true } } } },
        },
      });
      entries = labor.map((l) => ({
        resourceId: l.resourceId!,
        day: toBrussels(l.completion.appointment.startAt).toISODate()!,
        hours: Number(q.metric === "registered" ? l.registeredHours : l.invoicedHours),
      }));
    }

    const body: DashboardHoursResponse = {
      resources: resources.map((r) => ({ id: r.id, name: r.name, type: r.type, active: r.active })),
      entries,
    };
    return NextResponse.json(body);
  } catch (error) {
    return handleApiError(error);
  }
}
