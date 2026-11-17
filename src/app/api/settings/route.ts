import { type NextRequest, NextResponse } from "next/server";
import { handleApiError, requireUser } from "@/lib/api";
import { settingsUpdateSchema } from "@/lib/schemas/settings";
import { isMailConfigured } from "@/lib/services/mailer";
import { getSettings, updateSettings } from "@/lib/services/settings";
import { efIsConfigured } from "@/lib/ef/client";

/** GET /api/settings — instellingen + configuratiestatus van de koppelingen. */
export async function GET() {
  try {
    await requireUser();
    const settings = await getSettings();
    return NextResponse.json({
      ...settings,
      mailConfigured: isMailConfigured(),
      efConfigured: efIsConfigured(),
    });
  } catch (error) {
    return handleApiError(error);
  }
}

/** PUT /api/settings — een of meer instellingen bijwerken. */
export async function PUT(request: NextRequest) {
  try {
    await requireUser();
    const update = settingsUpdateSchema.parse(await request.json());
    const settings = await updateSettings(update);
    return NextResponse.json(settings);
  } catch (error) {
    return handleApiError(error);
  }
}
