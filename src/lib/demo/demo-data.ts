import { ApiError } from "../api";
import { db } from "../db";
import { nextSortOrder } from "../schemas/checklist";
import { windowLabel } from "../schemas/recurring";
import { checklistNames, replaceTemplateTasks, syncTodoTasks } from "../services/checklist-tasks";
import { runRecurringGenerationJob } from "../services/recurring";
import { getSettings } from "../services/settings";
import { replaceTemplateResources, replaceTodoResources } from "../services/todo-resources";
import {
  DEMO_CHECKLIST,
  DEMO_CUSTOMERS,
  DEMO_MACHINES,
  DEMO_PEOPLE,
  type DemoResources,
  type DemoTask,
} from "./dataset";

/**
 * Installs / removes the demo dataset (see dataset.ts). Everything is written
 * through `db`, so it shows up in the audit trail like any other change.
 *
 * Demo customers carry isDemo = true; removing the demo data deletes them with
 * everything attached (todos, appointments, registrations, invoices, recurring
 * work) — including things you created on them while testing. Real data is
 * never touched: people (Cis/Wim/Ken) are reused, never removed, and demo
 * machines/checklist items that real data still uses are deactivated instead
 * of deleted.
 */

export interface DemoStatus {
  active: boolean;
  customers: number;
  todos: number;
}

export async function getDemoStatus(): Promise<DemoStatus> {
  const [customers, todos] = await Promise.all([
    db.customer.count({ where: { isDemo: true } }),
    db.todo.count({ where: { customer: { isDemo: true } } }),
  ]);
  return { active: customers > 0, customers, todos };
}

/** Finds a resource by name (case-insensitive) or creates it. */
async function ensureResource(
  name: string,
  type: "PERSON" | "MACHINE",
  hourlyRate: number,
): Promise<number> {
  const existing = await db.resource.findFirst({
    where: { name: { equals: name, mode: "insensitive" }, type },
    orderBy: { id: "asc" },
  });
  if (existing) return existing.id;
  // People are real staff: never flagged as demo (and so never removed again).
  const created = await db.resource.create({
    data: { name, type, hourlyRate, isDemo: type === "MACHINE" },
  });
  return created.id;
}

async function ensureChecklistItem(name: string): Promise<number> {
  const existing = await db.checklistItem.findFirst({
    where: { name: { equals: name, mode: "insensitive" } },
    orderBy: { id: "asc" },
  });
  if (existing) return existing.id;
  const all = await db.checklistItem.findMany({ select: { sortOrder: true } });
  const created = await db.checklistItem.create({
    data: { name, isDemo: true, sortOrder: nextSortOrder(all) },
  });
  return created.id;
}

export async function installDemoData(): Promise<DemoStatus & { recurringTodos: number }> {
  if ((await getDemoStatus()).active) {
    throw new ApiError("De demodata is al geladen. Verwijder ze eerst om ze opnieuw te laden.", 409);
  }

  const settings = await getSettings();
  const resourceIds = new Map<string, number>();
  for (const person of DEMO_PEOPLE) {
    resourceIds.set(person, await ensureResource(person, "PERSON", settings.ownHourlyRate));
  }
  for (const machine of DEMO_MACHINES) {
    resourceIds.set(machine.name, await ensureResource(machine.name, "MACHINE", machine.hourlyRate));
  }
  const taskIds = new Map<string, number>();
  for (const task of DEMO_CHECKLIST) {
    taskIds.set(task, await ensureChecklistItem(task));
  }

  const toResourceInput = (resources: DemoResources) =>
    Object.entries(resources).map(([name, hours]) => ({
      resourceId: resourceIds.get(name) as number,
      hours: hours as number,
    }));
  const toTaskIds = (tasks: DemoTask[] = []) => tasks.map((t) => taskIds.get(t) as number);

  for (const demo of DEMO_CUSTOMERS) {
    const customer = await db.customer.create({
      data: {
        name: demo.name,
        street: demo.street,
        postalCode: demo.postalCode,
        city: demo.city,
        phone: demo.phone,
        notes: demo.notes,
        countryCode: "BE",
        isDemo: true,
      },
    });

    for (const todo of demo.todos) {
      const created = await db.todo.create({
        data: {
          customerId: customer.id,
          title: todo.title,
          description: todo.description,
          estimatedHours: todo.estimatedHours,
        },
      });
      await replaceTodoResources(created.id, toResourceInput(todo.resources));
      const ids = toTaskIds(todo.tasks);
      await syncTodoTasks(created.id, ids, await checklistNames(ids));
    }

    for (const recurring of demo.recurring ?? []) {
      const template = await db.recurringTemplate.create({
        data: {
          customerId: customer.id,
          title: recurring.title,
          estimatedHours: recurring.estimatedHours,
          leadTimeDays: recurring.leadTimeDays,
          windows: {
            create: recurring.windows.map((w, i) => ({
              label: w.label || windowLabel(w.startMonth, w.endMonth),
              startMonth: w.startMonth,
              startDay: 1,
              endMonth: w.endMonth,
              endDay: 31,
              sortOrder: i,
            })),
          },
        },
      });
      await replaceTemplateResources(template.id, toResourceInput(recurring.resources));
      await replaceTemplateTasks(template.id, toTaskIds(recurring.tasks));
    }
  }

  // Generate the recurring todos whose window is near (e.g. "Nov–Dec").
  const { todosCreated } = await runRecurringGenerationJob();
  return { ...(await getDemoStatus()), recurringTodos: todosCreated };
}

export interface DemoRemovalResult {
  customers: number;
  todos: number;
  resourcesDeleted: number;
  resourcesDeactivated: number;
  checklistDeleted: number;
  checklistDeactivated: number;
}

export async function removeDemoData(): Promise<DemoRemovalResult> {
  const customers = await db.customer.findMany({ where: { isDemo: true }, select: { id: true } });
  const customerIds = customers.map((c) => c.id);
  const todoIds = (
    await db.todo.findMany({ where: { customerId: { in: customerIds } }, select: { id: true } })
  ).map((t) => t.id);
  const appointmentIds = (
    await db.appointment.findMany({ where: { todoId: { in: todoIds } }, select: { id: true } })
  ).map((a) => a.id);
  const completionIds = (
    await db.completion.findMany({ where: { appointmentId: { in: appointmentIds } }, select: { id: true } })
  ).map((c) => c.id);
  const templateIds = (
    await db.recurringTemplate.findMany({ where: { customerId: { in: customerIds } }, select: { id: true } })
  ).map((t) => t.id);

  // Children before parents, explicitly (not via cascades) so each delete is audited.
  await db.invoice.deleteMany({ where: { customerId: { in: customerIds } } });
  await db.laborEntry.deleteMany({ where: { completionId: { in: completionIds } } });
  await db.extraCharge.deleteMany({ where: { completionId: { in: completionIds } } });
  await db.completion.deleteMany({ where: { id: { in: completionIds } } });
  await db.appointment.deleteMany({ where: { id: { in: appointmentIds } } });
  await db.todoTask.deleteMany({ where: { todoId: { in: todoIds } } });
  await db.todoResource.deleteMany({ where: { todoId: { in: todoIds } } });
  await db.todo.deleteMany({ where: { id: { in: todoIds } } });
  await db.recurringTemplateTask.deleteMany({ where: { templateId: { in: templateIds } } });
  await db.recurringTemplateResource.deleteMany({ where: { templateId: { in: templateIds } } });
  await db.recurringWindow.deleteMany({ where: { templateId: { in: templateIds } } });
  await db.recurringTemplate.deleteMany({ where: { id: { in: templateIds } } });
  await db.customer.deleteMany({ where: { id: { in: customerIds } } });

  const result: DemoRemovalResult = {
    customers: customerIds.length,
    todos: todoIds.length,
    resourcesDeleted: 0,
    resourcesDeactivated: 0,
    checklistDeleted: 0,
    checklistDeactivated: 0,
  };

  // Demo machines / checklist items: delete, unless real data started using them.
  for (const resource of await db.resource.findMany({ where: { isDemo: true } })) {
    const inUse =
      (await db.todoResource.count({ where: { resourceId: resource.id } })) +
      (await db.recurringTemplateResource.count({ where: { resourceId: resource.id } }));
    if (inUse > 0) {
      await db.resource.update({ where: { id: resource.id }, data: { active: false } });
      result.resourcesDeactivated++;
    } else {
      await db.resource.delete({ where: { id: resource.id } });
      result.resourcesDeleted++;
    }
  }
  for (const item of await db.checklistItem.findMany({ where: { isDemo: true } })) {
    const inUse =
      (await db.todoTask.count({ where: { checklistItemId: item.id } })) +
      (await db.recurringTemplateTask.count({ where: { checklistItemId: item.id } }));
    if (inUse > 0) {
      await db.checklistItem.update({ where: { id: item.id }, data: { active: false } });
      result.checklistDeactivated++;
    } else {
      await db.checklistItem.delete({ where: { id: item.id } });
      result.checklistDeleted++;
    }
  }
  return result;
}
