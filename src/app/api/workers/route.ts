import { type NextRequest, NextResponse } from "next/server";
import { handleApiError, requireUser } from "@/lib/api";
import { db } from "@/lib/db";
import { workerInputSchema } from "@/lib/schemas/catalog";

/** GET /api/workers?includeInactive=1 — picklist voor de registratieflow. */
export async function GET(request: NextRequest) {
  try {
    await requireUser();
    const includeInactive = request.nextUrl.searchParams.get("includeInactive") === "1";
    const workers = await db.worker.findMany({
      where: includeInactive ? undefined : { active: true },
      orderBy: { name: "asc" },
    });
    return NextResponse.json(
      workers.map((w) => ({ ...w, hourlyRate: Number(w.hourlyRate) })),
    );
  } catch (error) {
    return handleApiError(error);
  }
}

/** POST /api/workers — vaste medewerker toevoegen. */
export async function POST(request: NextRequest) {
  try {
    await requireUser();
    const input = workerInputSchema.parse(await request.json());
    const worker = await db.worker.create({ data: input });
    return NextResponse.json({ ...worker, hourlyRate: Number(worker.hourlyRate) }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
