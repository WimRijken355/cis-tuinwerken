import { type NextRequest, NextResponse } from "next/server";
import { handleApiError, requireUser } from "@/lib/api";
import { db } from "@/lib/db";
import { todoInputSchema } from "@/lib/schemas/todos";
import type { Prisma } from "@/generated/prisma/client";

/**
 * GET /api/todos?customerId=&status=&plannable=1
 * - plannable=1 → alleen OPEN todo's (voor de planning-zijbalk),
 *   gesorteerd op voorkeursvenster (terugkerend werk eerst dat eraan komt).
 */
export async function GET(request: NextRequest) {
  try {
    await requireUser();
    const sp = request.nextUrl.searchParams;
    const customerId = sp.get("customerId");
    const status = sp.get("status");
    const plannable = sp.get("plannable") === "1";

    const where: Prisma.TodoWhereInput = {
      ...(customerId ? { customerId: Number(customerId) } : {}),
      ...(plannable
        ? { status: "OPEN" }
        : status
          ? { status: status as Prisma.TodoWhereInput["status"] }
          : {}),
    };

    const todos = await db.todo.findMany({
      where,
      include: {
        customer: { select: { name: true } },
        recurringWindow: { select: { label: true } },
      },
      orderBy: plannable
        ? [{ windowStart: { sort: "asc", nulls: "last" } }, { createdAt: "asc" }]
        : [{ createdAt: "desc" }],
    });

    return NextResponse.json(
      todos.map((t) => ({
        ...t,
        estimatedHours: Number(t.estimatedHours),
        customerName: t.customer.name,
        windowLabel: t.recurringWindow?.label ?? null,
        customer: undefined,
        recurringWindow: undefined,
      })),
    );
  } catch (error) {
    return handleApiError(error);
  }
}

/** POST /api/todos — nieuwe todo voor een klant. */
export async function POST(request: NextRequest) {
  try {
    await requireUser();
    const input = todoInputSchema.parse(await request.json());

    const todo = await db.todo.create({
      data: input,
      include: { customer: { select: { name: true } } },
    });
    return NextResponse.json(
      {
        ...todo,
        estimatedHours: Number(todo.estimatedHours),
        customerName: todo.customer.name,
        customer: undefined,
      },
      { status: 201 },
    );
  } catch (error) {
    return handleApiError(error);
  }
}
