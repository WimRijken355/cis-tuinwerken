import { type NextRequest, NextResponse } from "next/server";
import { ApiError, handleApiError, requireUser } from "@/lib/api";
import { db } from "@/lib/db";
import { workerInputSchema } from "@/lib/schemas/catalog";

async function parseId(params: Promise<{ id: string }>): Promise<number> {
  const id = Number((await params).id);
  if (!Number.isInteger(id) || id <= 0) throw new ApiError("Ongeldig id", 400);
  return id;
}

/** PATCH /api/workers/:id — naam/tarief/actief aanpassen. */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requireUser();
    const id = await parseId(params);
    const input = workerInputSchema.partial().parse(await request.json());
    const worker = await db.worker.update({ where: { id }, data: input });
    return NextResponse.json({ ...worker, hourlyRate: Number(worker.hourlyRate) });
  } catch (error) {
    return handleApiError(error);
  }
}

/**
 * DELETE /api/workers/:id — veilig: geregistreerde uren zijn snapshots
 * (naam + tarief staan in LaborEntry zelf), dus historiek blijft intact.
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requireUser();
    const id = await parseId(params);
    await db.worker.delete({ where: { id } });
    return NextResponse.json({ deleted: true });
  } catch (error) {
    return handleApiError(error);
  }
}
