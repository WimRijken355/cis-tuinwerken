import { NextResponse } from "next/server";
import { handleApiError, requireAdmin } from "@/lib/api";
import { getDemoStatus, installDemoData, removeDemoData } from "@/lib/demo/demo-data";

/** GET /api/demo-data — is the demo data loaded? (ADMIN-only) */
export async function GET() {
  try {
    await requireAdmin();
    return NextResponse.json(await getDemoStatus());
  } catch (error) {
    return handleApiError(error);
  }
}

/** POST /api/demo-data — load the demo dataset (409 when already loaded). */
export async function POST() {
  try {
    await requireAdmin();
    return NextResponse.json(await installDemoData(), { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}

/** DELETE /api/demo-data — remove all demo customers with everything attached. */
export async function DELETE() {
  try {
    await requireAdmin();
    return NextResponse.json(await removeDemoData());
  } catch (error) {
    return handleApiError(error);
  }
}
