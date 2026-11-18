import { db } from "../db";
import { partNumbers, plannedMinutes, remainingMinutes } from "../planning";
import type { AppointmentDto } from "../schemas/appointments";
import { formatAddress } from "../schemas/customers";
import { toTodoResourceDtos } from "../schemas/todos";

/** Prisma-include waarmee een afspraak alles heeft voor de DTO. */
export const appointmentInclude = {
  todo: {
    include: {
      customer: true,
      resources: {
        include: { resource: { select: { name: true, type: true } } },
        orderBy: { id: "asc" as const },
      },
    },
  },
} as const;

type AppointmentWithRelations = {
  id: number;
  todoId: number;
  startAt: Date;
  durationMinutes: number;
  status: "PLANNED" | "DONE" | "CANCELLED";
  note: string | null;
  reminderSentAt: Date | null;
  reminderError: string | null;
  confirmed: boolean;
  reservation: boolean;
  todo: {
    title: string;
    estimatedHours: unknown;
    resources: { resourceId: number; hours: unknown; resource: { name: string; type: "PERSON" | "MACHINE" } }[];
    customer: {
      id: number;
      name: string;
      email: string | null;
      street: string | null;
      postalCode: string | null;
      city: string | null;
      isDemo: boolean;
    } | null;
  };
};

export interface TodoPlanningMeta {
  plannedMinutes: number;
  remainingMinutes: number;
  parts: Map<number, { index: number; total: number }>;
}

/**
 * Planning metadata per todo (planned/remaining time and the "x/y" number
 * of each block), computed over ALL its blocks — not only those in view.
 */
export async function loadPlanningMeta(todoIds: number[]): Promise<Map<number, TodoPlanningMeta>> {
  const ids = [...new Set(todoIds)];
  if (ids.length === 0) return new Map();
  const todos = await db.todo.findMany({
    where: { id: { in: ids } },
    select: {
      id: true,
      estimatedHours: true,
      appointments: {
        where: { status: { not: "CANCELLED" } },
        select: { id: true, startAt: true, durationMinutes: true, status: true },
      },
    },
  });
  return new Map(
    todos.map((t) => {
      const planned = plannedMinutes(t.appointments);
      const remaining = remainingMinutes(Number(t.estimatedHours), planned);
      return [t.id, { plannedMinutes: planned, remainingMinutes: remaining, parts: partNumbers(t.appointments, remaining) }];
    }),
  );
}

export function toAppointmentDto(a: AppointmentWithRelations, meta?: TodoPlanningMeta): AppointmentDto {
  const customer = a.todo.customer;
  return {
    id: a.id,
    todoId: a.todoId,
    startAt: a.startAt.toISOString(),
    durationMinutes: a.durationMinutes,
    status: a.status,
    note: a.note,
    reminderSentAt: a.reminderSentAt?.toISOString() ?? null,
    reminderError: a.reminderError,
    todoTitle: a.todo.title,
    estimatedHours: Number(a.todo.estimatedHours),
    customerId: customer?.id ?? null,
    customerName: customer?.name ?? "",
    isLoose: customer === null,
    isDemo: customer?.isDemo ?? false,
    customerCity: customer?.city ?? null,
    address: customer ? formatAddress(customer) : "",
    customerEmail: customer?.email ?? null,
    confirmed: a.confirmed,
    reservation: a.reservation,
    resources: toTodoResourceDtos(a.todo.resources),
    part: meta?.parts.get(a.id) ?? { index: 1, total: 1 },
    todoRemainingMinutes: meta?.remainingMinutes ?? 0,
  };
}

/** DTOs for a list of appointments, with planning metadata loaded in one go. */
export async function toAppointmentDtos(list: AppointmentWithRelations[]): Promise<AppointmentDto[]> {
  const meta = await loadPlanningMeta(list.map((a) => a.todoId));
  return list.map((a) => toAppointmentDto(a, meta.get(a.todoId)));
}

/**
 * Houdt de todo-status in lijn met zijn afspraken:
 * - minstens één niet-geannuleerde afspraak → PLANNED
 * - geen (meer) → terug OPEN
 * (DONE/CANCELLED todo's blijven onaangeroerd.)
 */
export async function syncTodoStatus(todoId: number): Promise<void> {
  const todo = await db.todo.findUnique({
    where: { id: todoId },
    include: { _count: { select: { appointments: { where: { status: "PLANNED" } } } } },
  });
  if (!todo || todo.status === "DONE" || todo.status === "CANCELLED") return;

  const target = todo._count.appointments > 0 ? "PLANNED" : "OPEN";
  if (todo.status !== target) {
    await db.todo.update({ where: { id: todoId }, data: { status: target } });
  }
}
