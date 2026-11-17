import { type NextRequest, NextResponse } from "next/server";
import { handleApiError, requireUser } from "@/lib/api";
import { db } from "@/lib/db";
import { customerInputSchema } from "@/lib/schemas/customers";

/**
 * GET /api/customers?search=&includeInactive=1
 * Lijst van klanten met het aantal open/geplande todo's.
 */
export async function GET(request: NextRequest) {
  try {
    await requireUser();
    const search = request.nextUrl.searchParams.get("search")?.trim();
    const includeInactive = request.nextUrl.searchParams.get("includeInactive") === "1";

    const customers = await db.customer.findMany({
      where: {
        ...(includeInactive ? {} : { active: true }),
        ...(search
          ? {
              OR: [
                { name: { contains: search, mode: "insensitive" } },
                { city: { contains: search, mode: "insensitive" } },
                { street: { contains: search, mode: "insensitive" } },
              ],
            }
          : {}),
      },
      orderBy: { name: "asc" },
      include: {
        _count: {
          select: { todos: { where: { status: { in: ["OPEN", "PLANNED"] } } } },
        },
      },
    });

    return NextResponse.json(
      customers.map(({ _count, ...c }) => ({ ...c, openTodoCount: _count.todos })),
    );
  } catch (error) {
    return handleApiError(error);
  }
}

/** POST /api/customers — nieuwe klant aanmaken. */
export async function POST(request: NextRequest) {
  try {
    await requireUser();
    const input = customerInputSchema.parse(await request.json());

    const customer = await db.customer.create({
      data: { ...input, email: input.email || null },
    });
    return NextResponse.json(customer, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
