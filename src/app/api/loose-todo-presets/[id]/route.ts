import { type NextRequest, NextResponse } from "next/server";
import { ApiError, handleApiError, requireUser } from "@/lib/api";
import { db } from "@/lib/db";
import { looseTodoPresetUpdateSchema } from "@/lib/schemas/loose-todo-presets";

async function parseId(params: Promise<{ id: string }>): Promise<number> {
  const id = Number((await params).id);
  if (!Number.isInteger(id) || id <= 0) throw new ApiError("Ongeldig id", 400);
  return id;
}

/** PATCH /api/loose-todo-presets/:id — rename or (de)activate. */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireUser();
    const id = await parseId(params);
    const input = looseTodoPresetUpdateSchema.parse(await request.json());
    return NextResponse.json(await db.looseTodoPreset.update({ where: { id }, data: input }));
  } catch (error) {
    return handleApiError(error);
  }
}

/** DELETE /api/loose-todo-presets/:id — always safe: a preset only pre-fills a title. */
export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireUser();
    const id = await parseId(params);
    await db.looseTodoPreset.delete({ where: { id } });
    return NextResponse.json({ deleted: true });
  } catch (error) {
    return handleApiError(error);
  }
}
