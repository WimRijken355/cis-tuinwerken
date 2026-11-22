import { type NextRequest, NextResponse } from "next/server";
import { ApiError, handleApiError, requireUser } from "@/lib/api";
import { db } from "@/lib/db";
import {
  patternData,
  pickPatternFields,
  recurringExtrasInclude,
  recurringTemplateUpdateSchema,
  templateProblems,
  toRecurrencePattern,
  toRecurringExtrasDto,
} from "@/lib/schemas/recurring";
import { checklistNames, replaceTemplateTasks } from "@/lib/services/checklist-tasks";
import { assertResourcesExist, replaceTemplateResources } from "@/lib/services/todo-resources";

async function parseId(params: Promise<{ id: string }>): Promise<number> {
  const id = Number((await params).id);
  if (!Number.isInteger(id) || id <= 0) throw new ApiError("Ongeldig id", 400);
  return id;
}

/**
 * PATCH /api/recurring-templates/:id
 *
 * Windows worden "gereconcilieerd" i.p.v. blind vervangen: bestaande windows
 * (met id) worden bijgewerkt, nieuwe aangemaakt, weggelaten verwijderd.
 * Zo blijft de idempotentie-sleutel (windowId, jaar) intact en genereert een
 * bewerking geen dubbele beurten voor al bestaande periodes.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requireUser();
    const id = await parseId(params);
    const input = recurringTemplateUpdateSchema.parse(await request.json());

    const existing = await db.recurringTemplate.findUnique({
      where: { id },
      include: { windows: true },
    });
    if (!existing) throw new ApiError("Sjabloon niet gevonden", 404);
    // Validate the template as it will be after this PATCH (current values + changes).
    const patternInput = pickPatternFields(input);
    const merged = { ...toRecurrencePattern(existing), ...patternInput };
    const problems = templateProblems({
      ...merged,
      windowCount: input.windows ? input.windows.length : existing.windows.length,
    });
    if (problems.length > 0) throw new ApiError(problems.join(" "), 400);
    if (input.resources) await assertResourcesExist(input.resources);
    if (input.taskIds) await checklistNames(input.taskIds);

    await db.$transaction(async (tx) => {
      await tx.recurringTemplate.update({
        where: { id },
        data: {
          title: input.title,
          description: input.description,
          invoiceDescription: input.invoiceDescription,
          estimatedHours: input.estimatedHours,
          leadTimeDays: input.leadTimeDays,
          active: input.active,
          ...patternData(patternInput),
        },
      });

      if (input.windows) {
        const keptIds = input.windows.filter((w) => w.id).map((w) => w.id as number);
        await tx.recurringWindow.deleteMany({
          where: { templateId: id, id: { notIn: keptIds } },
        });
        for (const [i, w] of input.windows.entries()) {
          const data = {
            label: w.label,
            startMonth: w.startMonth,
            startDay: w.startDay,
            endMonth: w.endMonth,
            endDay: w.endDay,
            sortOrder: w.sortOrder || i,
          };
          if (w.id) {
            await tx.recurringWindow.update({ where: { id: w.id }, data });
          } else {
            await tx.recurringWindow.create({ data: { ...data, templateId: id } });
          }
        }
      }
    });

    // Outside the transaction on purpose: only writes through `db` are audited.
    // Affects todos generated from now on; existing todos keep their own set.
    if (input.resources) await replaceTemplateResources(id, input.resources);
    if (input.taskIds) await replaceTemplateTasks(id, input.taskIds);

    const updated = await db.recurringTemplate.findUniqueOrThrow({
      where: { id },
      include: { windows: { orderBy: { sortOrder: "asc" } }, ...recurringExtrasInclude },
    });
    return NextResponse.json({
      ...updated,
      estimatedHours: Number(updated.estimatedHours),
      ...toRecurrencePattern(updated),
      ...toRecurringExtrasDto(updated),
    });
  } catch (error) {
    return handleApiError(error);
  }
}

/**
 * DELETE /api/recurring-templates/:id
 * Al gegenereerde todo's blijven bestaan (hun window-koppeling wordt losgelaten);
 * er komen gewoon geen nieuwe beurten meer bij.
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requireUser();
    const id = await parseId(params);
    await db.recurringTemplate.delete({ where: { id } });
    return NextResponse.json({ deleted: true });
  } catch (error) {
    return handleApiError(error);
  }
}
