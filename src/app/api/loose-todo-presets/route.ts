import { type NextRequest, NextResponse } from "next/server";
import { handleApiError, requireUser } from "@/lib/api";
import { db } from "@/lib/db";
import { looseTodoPresetInputSchema } from "@/lib/schemas/loose-todo-presets";
import { nextSortOrder } from "@/lib/sortable";

/** GET /api/loose-todo-presets?includeInactive=1 — quick picks for losse todo's, in order. */
export async function GET(request: NextRequest) {
  try {
    await requireUser();
    const includeInactive = request.nextUrl.searchParams.get("includeInactive") === "1";
    const presets = await db.looseTodoPreset.findMany({
      where: includeInactive ? undefined : { active: true },
      orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
    });
    return NextResponse.json(presets);
  } catch (error) {
    return handleApiError(error);
  }
}

/** POST /api/loose-todo-presets — new quick pick, appended at the end. */
export async function POST(request: NextRequest) {
  try {
    await requireUser();
    const input = looseTodoPresetInputSchema.parse(await request.json());
    const existing = await db.looseTodoPreset.findMany({ select: { sortOrder: true } });
    const preset = await db.looseTodoPreset.create({ data: { ...input, sortOrder: nextSortOrder(existing) } });
    return NextResponse.json(preset, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
