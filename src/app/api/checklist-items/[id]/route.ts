import { type NextRequest, NextResponse } from "next/server";
import { ApiError, handleApiError, requireUser } from "@/lib/api";
import { db } from "@/lib/db";
import { checklistItemUpdateSchema } from "@/lib/schemas/checklist";

async function parseChecklistId(params: Promise<{ id: string }>): Promise<number> {
  const id = Number((await params).id);
  if (!Number.isInteger(id) || id <= 0) throw new ApiError("Ongeldig id", 400);
  return id;
}

/**
 * PATCH /api/checklist-items/:id — rename, (de)activate. Renaming does not
 * change todos that already have this task (they keep their own label).
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requireUser();
    const id = await parseChecklistId(params);
    const input = checklistItemUpdateSchema.parse(await request.json());
    const item = await db.checklistItem.update({ where: { id }, data: input });
    return NextResponse.json(item);
  } catch (error) {
    return handleApiError(error);
  }
}

/** DELETE /api/checklist-items/:id — only while no todo or recurring work uses it. */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requireUser();
    const id = await parseChecklistId(params);
    const [todoUse, templateUse] = await Promise.all([
      db.todoTask.count({ where: { checklistItemId: id } }),
      db.recurringTemplateTask.count({ where: { checklistItemId: id } }),
    ]);
    if (todoUse + templateUse > 0) {
      throw new ApiError(
        "Deze taak wordt nog gebruikt bij todo's of terugkerend werk. Deactiveer hem in plaats van hem te verwijderen.",
        409,
      );
    }
    await db.checklistItem.delete({ where: { id } });
    return NextResponse.json({ deleted: true });
  } catch (error) {
    return handleApiError(error);
  }
}
