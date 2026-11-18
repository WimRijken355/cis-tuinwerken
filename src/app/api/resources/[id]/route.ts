import { type NextRequest, NextResponse } from "next/server";
import { ApiError, handleApiError, requireUser } from "@/lib/api";
import { db } from "@/lib/db";
import { resourceUpdateSchema } from "@/lib/schemas/resources";

async function parseId(params: Promise<{ id: string }>): Promise<number> {
  const id = Number((await params).id);
  if (!Number.isInteger(id) || id <= 0) throw new ApiError("Ongeldig id", 400);
  return id;
}

/** PATCH /api/resources/:id — name, type, rate or active flag. */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requireUser();
    const id = await parseId(params);
    const input = resourceUpdateSchema.parse(await request.json());
    const resource = await db.resource.update({ where: { id }, data: input });
    return NextResponse.json({ ...resource, hourlyRate: Number(resource.hourlyRate) });
  } catch (error) {
    return handleApiError(error);
  }
}

/**
 * DELETE /api/resources/:id — registered hours are snapshots (name + rate in
 * LaborEntry), so history stays intact. Refused while todos still plan this
 * resource; deactivating is the way to go then.
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requireUser();
    const id = await parseId(params);
    const usage = await db.todoResource.count({ where: { resourceId: id } });
    if (usage > 0) {
      throw new ApiError(
        `Deze resource is nog ingepland bij ${usage} todo('s). Deactiveer hem in plaats van hem te verwijderen.`,
        409,
      );
    }
    await db.resource.delete({ where: { id } });
    return NextResponse.json({ deleted: true });
  } catch (error) {
    return handleApiError(error);
  }
}
