import { db } from "../db";
import type { AppointmentDto } from "../schemas/appointments";
import { formatAddress } from "../schemas/customers";

/** Prisma-include waarmee een afspraak alles heeft voor de DTO. */
export const appointmentInclude = {
  todo: { include: { customer: true } },
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
  todo: {
    title: string;
    estimatedHours: unknown;
    customer: {
      id: number;
      name: string;
      email: string | null;
      street: string | null;
      postalCode: string | null;
      city: string | null;
    };
  };
};

export function toAppointmentDto(a: AppointmentWithRelations): AppointmentDto {
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
    customerId: a.todo.customer.id,
    customerName: a.todo.customer.name,
    address: formatAddress(a.todo.customer),
    customerEmail: a.todo.customer.email,
  };
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
