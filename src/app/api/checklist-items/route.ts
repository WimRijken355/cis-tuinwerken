import { type NextRequest, NextResponse } from "next/server";
import { handleApiError, requireUser } from "@/lib/api";
import { db } from "@/lib/db";
import { checklistItemInputSchema, nextSortOrder } from "@/lib/schemas/checklist";

/** GET /api/checklist-items?includeInactive=1 — the checklist master list, in order. */
export async function GET(request: NextRequest) {
  try {
    await requireUser();
    const includeInactive = request.nextUrl.searchParams.get("includeInactive") === "1";
    const items = await db.checklistItem.findMany({
      where: includeInactive ? undefined : { active: true },
      orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
    });
    return NextResponse.json(items);
  } catch (error) {
    return handleApiError(error);
  }
}

/** POST /api/checklist-items — new task, appended at the end of the list. */
export async function POST(request: NextRequest) {
  try {
    await requireUser();
    const input = checklistItemInputSchema.parse(await request.json());
    const existing = await db.checklistItem.findMany({ select: { sortOrder: true } });
    const item = await db.checklistItem.create({
      data: { ...input, sortOrder: nextSortOrder(existing) },
    });
    return NextResponse.json(item, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
