import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { ApiError, handleApiError, requireUser } from "@/lib/api";
import { db } from "@/lib/db";
import { reorder } from "@/lib/schemas/checklist";

const bodySchema = z.object({ direction: z.union([z.literal(-1), z.literal(1)]) });

/** POST /api/checklist-items/:id/move — `{ direction: -1 | 1 }` moves the task up/down. */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requireUser();
    const id = Number((await params).id);
    if (!Number.isInteger(id) || id <= 0) throw new ApiError("Ongeldig id", 400);
    const { direction } = bodySchema.parse(await request.json());

    const items = await db.checklistItem.findMany({ select: { id: true, sortOrder: true } });
    for (const change of reorder(items, id, direction)) {
      await db.checklistItem.update({ where: { id: change.id }, data: { sortOrder: change.sortOrder } });
    }
    return NextResponse.json({ moved: true });
  } catch (error) {
    return handleApiError(error);
  }
}
