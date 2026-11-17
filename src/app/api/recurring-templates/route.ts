import { type NextRequest, NextResponse } from "next/server";
import { handleApiError, requireUser } from "@/lib/api";
import { db } from "@/lib/db";
import { recurringTemplateInputSchema } from "@/lib/schemas/recurring";

const include = {
  customer: { select: { name: true } },
  windows: { orderBy: { sortOrder: "asc" as const } },
};

type TemplateWithRelations = {
  estimatedHours: unknown;
  customer: { name: string };
} & Record<string, unknown>;

function toDto(t: TemplateWithRelations) {
  return {
    ...t,
    estimatedHours: Number(t.estimatedHours),
    customerName: t.customer.name,
    customer: undefined,
  };
}

/** GET /api/recurring-templates?customerId= */
export async function GET(request: NextRequest) {
  try {
    await requireUser();
    const customerId = request.nextUrl.searchParams.get("customerId");
    const templates = await db.recurringTemplate.findMany({
      where: customerId ? { customerId: Number(customerId) } : undefined,
      include,
      orderBy: [{ customerId: "asc" }, { title: "asc" }],
    });
    return NextResponse.json(templates.map(toDto));
  } catch (error) {
    return handleApiError(error);
  }
}

/** POST /api/recurring-templates — sjabloon + periodes in één keer. */
export async function POST(request: NextRequest) {
  try {
    await requireUser();
    const input = recurringTemplateInputSchema.parse(await request.json());

    const template = await db.recurringTemplate.create({
      data: {
        customerId: input.customerId,
        title: input.title,
        description: input.description,
        estimatedHours: input.estimatedHours,
        leadTimeDays: input.leadTimeDays,
        active: input.active,
        windows: {
          create: input.windows.map((w, i) => ({
            label: w.label,
            startMonth: w.startMonth,
            startDay: w.startDay,
            endMonth: w.endMonth,
            endDay: w.endDay,
            sortOrder: w.sortOrder || i,
          })),
        },
      },
      include,
    });
    return NextResponse.json(toDto(template), { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
