import { type NextRequest, NextResponse } from "next/server";
import { ApiError, handleApiError, requireUser } from "@/lib/api";
import { db } from "@/lib/db";
import { todoUpdateSchema } from "@/lib/schemas/todos";

async function parseId(params: Promise<{ id: string }>): Promise<number> {
  const id = Number((await params).id);
  if (!Number.isInteger(id) || id <= 0) throw new ApiError("Ongeldig todo-id", 400);
  return id;
}

/** GET /api/todos/:id */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requireUser();
    const id = await parseId(params);
    const todo = await db.todo.findUnique({
      where: { id },
      include: {
        customer: { select: { name: true } },
        appointments: { orderBy: { startAt: "desc" } },
      },
    });
    if (!todo) throw new ApiError("Todo niet gevonden", 404);
    return NextResponse.json({
      ...todo,
      estimatedHours: Number(todo.estimatedHours),
      customerName: todo.customer.name,
      customer: undefined,
    });
  } catch (error) {
    return handleApiError(error);
  }
}

/** PATCH /api/todos/:id — titel/omschrijving/uren/status aanpassen. */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requireUser();
    const id = await parseId(params);
    const input = todoUpdateSchema.parse(await request.json());

    const todo = await db.todo.update({
      where: { id },
      data: {
        ...input,
        ...(input.status === "DONE" ? { completedAt: new Date() } : {}),
        ...(input.status === "OPEN" ? { completedAt: null } : {}),
      },
    });
    return NextResponse.json({ ...todo, estimatedHours: Number(todo.estimatedHours) });
  } catch (error) {
    return handleApiError(error);
  }
}

/**
 * DELETE /api/todos/:id — alleen zolang er geen afspraken aan hangen;
 * daarna is annuleren (status CANCELLED) de juiste weg.
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requireUser();
    const id = await parseId(params);

    const todo = await db.todo.findUnique({
      where: { id },
      include: { _count: { select: { appointments: true } } },
    });
    if (!todo) throw new ApiError("Todo niet gevonden", 404);
    if (todo._count.appointments > 0) {
      throw new ApiError(
        "Deze todo heeft al afspraken. Annuleer hem in plaats van hem te verwijderen.",
        409,
      );
    }
    await db.todo.delete({ where: { id } });
    return NextResponse.json({ deleted: true });
  } catch (error) {
    return handleApiError(error);
  }
}
