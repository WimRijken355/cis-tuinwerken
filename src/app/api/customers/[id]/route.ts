import { type NextRequest, NextResponse } from "next/server";
import { ApiError, handleApiError, requireUser } from "@/lib/api";
import { db } from "@/lib/db";
import { customerInputSchema } from "@/lib/schemas/customers";
import { todoResourcesInclude, toTodoResourceDtos } from "@/lib/schemas/todos";

async function parseId(params: Promise<{ id: string }>): Promise<number> {
  const id = Number((await params).id);
  if (!Number.isInteger(id) || id <= 0) {
    throw new ApiError("Ongeldig klant-id", 400);
  }
  return id;
}

/** GET /api/customers/:id — detail met todo's en terugkerend werk. */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requireUser();
    const id = await parseId(params);

    const customer = await db.customer.findUnique({
      where: { id },
      include: {
        todos: {
          orderBy: [{ status: "asc" }, { createdAt: "desc" }],
          include: { recurringWindow: { select: { label: true } }, ...todoResourcesInclude },
        },
        recurringTemplates: {
          include: { windows: { orderBy: { sortOrder: "asc" } } },
          orderBy: { title: "asc" },
        },
      },
    });
    if (!customer) throw new ApiError("Klant niet gevonden", 404);

    return NextResponse.json({
      ...customer,
      todos: customer.todos.map((t) => ({
        ...t,
        estimatedHours: Number(t.estimatedHours),
        windowLabel: t.recurringWindow?.label ?? null,
        resources: toTodoResourceDtos(t.resources),
        recurringWindow: undefined,
      })),
      recurringTemplates: customer.recurringTemplates.map((rt) => ({
        ...rt,
        estimatedHours: Number(rt.estimatedHours),
      })),
    });
  } catch (error) {
    return handleApiError(error);
  }
}

/** PATCH /api/customers/:id — klant bijwerken (gedeeltelijk). */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requireUser();
    const id = await parseId(params);
    const input = customerInputSchema.partial().parse(await request.json());

    const customer = await db.customer.update({
      where: { id },
      data: { ...input, ...(input.email !== undefined ? { email: input.email || null } : {}) },
    });
    return NextResponse.json(customer);
  } catch (error) {
    return handleApiError(error);
  }
}

/**
 * DELETE /api/customers/:id
 * Klanten met historiek (todo's/facturen) worden gearchiveerd (active=false)
 * in plaats van verwijderd — historiek en facturen moeten raadpleegbaar blijven.
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requireUser();
    const id = await parseId(params);

    const counts = await db.customer.findUnique({
      where: { id },
      include: { _count: { select: { todos: true, invoices: true, recurringTemplates: true } } },
    });
    if (!counts) throw new ApiError("Klant niet gevonden", 404);

    const hasHistory =
      counts._count.todos > 0 || counts._count.invoices > 0 || counts._count.recurringTemplates > 0;

    if (hasHistory) {
      await db.customer.update({ where: { id }, data: { active: false } });
      return NextResponse.json({ archived: true });
    }
    await db.customer.delete({ where: { id } });
    return NextResponse.json({ deleted: true });
  } catch (error) {
    return handleApiError(error);
  }
}
