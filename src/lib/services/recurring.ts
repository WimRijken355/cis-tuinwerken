import { DateTime } from "luxon";
import { db } from "../db";
import { generatedTodoExtras, recurringExtrasInclude } from "../schemas/recurring";
import { nowBrussels, ZONE } from "../time";

/**
 * Generatie van todo's uit terugkerend werk.
 *
 * Elk RecurringWindow (bv. "Mei" of "Sep–Okt") levert per jaar één beurt op.
 * De todo verschijnt `leadTimeDays` vóór het begin van het venster in de lijst
 * "in te plannen", met de concrete voorkeursperiode (windowStart/windowEnd).
 *
 * Idempotentie: de unieke index op (recurringWindowId, occurrenceYear) maakt
 * het onmogelijk om dezelfde beurt twee keer te genereren — hoe vaak de job
 * ook draait (dagelijks 02:00 + bij elke serverstart). A unique-constraint
 * error (P2002) on create means "already generated" and is skipped.
 *
 * Every generated todo gets a copy of the template's resources (with hours)
 * and checklist tasks, so the todo can be adjusted on its own afterwards.
 */

export interface RecurringRunResult {
  windowsChecked: number;
  todosCreated: number;
}

/** Clamp de dag op het aantal dagen van die maand (31 → 30 in juni, …). */
function dateFor(year: number, month: number, day: number): DateTime {
  const base = DateTime.fromObject({ year, month, day: 1 }, { zone: ZONE });
  return base.set({ day: Math.min(day, base.daysInMonth ?? 28) });
}

/** Concreet venster voor een beurt in `year`; endMonth < startMonth = over de jaargrens. */
export function concreteWindow(
  window: { startMonth: number; startDay: number; endMonth: number; endDay: number },
  year: number,
): { start: DateTime; end: DateTime } {
  const start = dateFor(year, window.startMonth, window.startDay);
  const endYear = window.endMonth < window.startMonth ? year + 1 : year;
  const end = dateFor(endYear, window.endMonth, window.endDay).endOf("day");
  return { start, end };
}

export async function runRecurringGenerationJob(): Promise<RecurringRunResult> {
  const today = nowBrussels().startOf("day");

  const templates = await db.recurringTemplate.findMany({
    where: { active: true, customer: { active: true } },
    include: { windows: true, ...recurringExtrasInclude },
  });
  const templateByWindowId = new Map(
    templates.flatMap((t) => t.windows.map((w) => [w.id, t] as const)),
  );

  const toCreate: {
    customerId: number;
    title: string;
    description: string | null;
    estimatedHours: unknown;
    recurringWindowId: number;
    occurrenceYear: number;
    windowStart: Date;
    windowEnd: Date;
  }[] = [];

  let windowsChecked = 0;

  for (const template of templates) {
    for (const window of template.windows) {
      windowsChecked++;
      // Dit jaar én volgend jaar bekijken: een venster in januari moet al in
      // december (leadTime) kunnen verschijnen.
      for (const year of [today.year, today.year + 1]) {
        const { start, end } = concreteWindow(window, year);
        const visibleFrom = start.minus({ days: template.leadTimeDays });

        if (today >= visibleFrom && today <= end) {
          toCreate.push({
            customerId: template.customerId,
            title: template.title,
            description: template.description,
            estimatedHours: template.estimatedHours,
            recurringWindowId: window.id,
            occurrenceYear: year,
            // @db.Date-kolommen: bewaar de kalenderdag als UTC-middernacht.
            windowStart: new Date(start.toFormat("yyyy-MM-dd")),
            windowEnd: new Date(end.toFormat("yyyy-MM-dd")),
          });
        }
      }
    }
  }

  let todosCreated = 0;
  for (const data of toCreate) {
    let todoId: number;
    try {
      const todo = await db.todo.create({
        data: { ...data, estimatedHours: data.estimatedHours as never },
      });
      todoId = todo.id;
    } catch (error) {
      // Existing (windowId, year) occurrence: already generated earlier.
      if (isUniqueConstraintError(error)) continue;
      throw error;
    }
    todosCreated++;

    const template = templateByWindowId.get(data.recurringWindowId);
    if (template) {
      const extras = generatedTodoExtras(todoId, template);
      if (extras.resources.length > 0) {
        await db.todoResource.createMany({
          data: extras.resources.map((r) => ({ ...r, hours: r.hours as never })),
        });
      }
      if (extras.tasks.length > 0) {
        await db.todoTask.createMany({ data: extras.tasks });
      }
    }
  }

  if (todosCreated > 0) {
    console.log(`🔁 Recurring-job: ${todosCreated} nieuwe todo('s) gegenereerd`);
  }
  return { windowsChecked, todosCreated };
}

function isUniqueConstraintError(error: unknown): boolean {
  return typeof error === "object" && error !== null && (error as { code?: string }).code === "P2002";
}
