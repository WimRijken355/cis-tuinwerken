import { type NextRequest, NextResponse } from "next/server";
import { handleApiError, requireUser } from "@/lib/api";
import { db } from "@/lib/db";
import {
  recurringExtrasInclude,
  recurringTemplateInputSchema,
  toRecurringExtrasDto,
} from "@/lib/schemas/recurring";
import { checklistNames, replaceTemplateTasks } from "@/lib/services/checklist-tasks";
import { assertResourcesExist, replaceTemplateResources } from "@/lib/services/todo-resources";

const include = {
  customer: { select: { name: true } },
  windows: { orderBy: { sortOrder: "asc" as const } },
  ...recurringExtrasInclude,
};

type TemplateWithRelations = {
  estimatedHours: unknown;
  customer: { name: string };
} & Parameters<typeof toRecurringExtrasDto>[0];

function toDto(t: TemplateWithRelations) {
  return {
    ...t,
    estimatedHours: Number(t.estimatedHours),
    customerName: t.customer.name,
    customer: undefined,
    ...toRecurringExtrasDto(t),
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
    await assertResourcesExist(input.resources);
    await checklistNames(input.taskIds);

    const created = await db.recurringTemplate.create({
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
    });
    await replaceTemplateResources(created.id, input.resources);
    await replaceTemplateTasks(created.id, input.taskIds);

    const template = await db.recurringTemplate.findUniqueOrThrow({ where: { id: created.id }, include });
    return NextResponse.json(toDto(template), { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
