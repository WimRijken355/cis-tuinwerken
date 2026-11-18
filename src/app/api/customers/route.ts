import { type NextRequest, NextResponse } from "next/server";
import { handleApiError, requireUser } from "@/lib/api";
import { db } from "@/lib/db";
import { toSkipTake } from "@/lib/pagination";
import {
  buildCustomerWhere,
  customerInputSchema,
  customerListQuerySchema,
  type CustomerListResponse,
} from "@/lib/schemas/customers";

/**
 * GET /api/customers?page=&pageSize=&name=&address=&postalCode=&city=&includeInactive=1
 * Paginated customer list, including the number of open/planned todos.
 */
export async function GET(request: NextRequest) {
  try {
    await requireUser();
    const query = customerListQuerySchema.parse(Object.fromEntries(request.nextUrl.searchParams));
    const where = buildCustomerWhere(query);

    const [customers, total] = await Promise.all([
      db.customer.findMany({
        where,
        orderBy: [{ name: "asc" }, { id: "asc" }],
        ...toSkipTake(query),
        include: {
          _count: {
            select: { todos: { where: { status: { in: ["OPEN", "PLANNED"] } } } },
          },
        },
      }),
      db.customer.count({ where }),
    ]);

    const response: CustomerListResponse = {
      items: customers.map(({ _count, ...c }) => ({ ...c, openTodoCount: _count.todos })),
      total,
      page: query.page,
      pageSize: query.pageSize,
    };
    return NextResponse.json(response);
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
