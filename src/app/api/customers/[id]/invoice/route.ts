import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { ApiError, handleApiError, requireUser } from "@/lib/api";
import { db } from "@/lib/db";
import { invoiceTogetherProblem } from "@/lib/registration";
import { createJobInvoiceInTx, pushNewJobInvoice } from "@/lib/services/job-close";
import { loadUninvoicedJobs } from "@/lib/services/registration";

const bodySchema = z.object({
  /** Finished todos of this customer to put on one invoice (grouped per todo). */
  todoIds: z.array(z.number().int().positive()).min(1, "Kies minstens één todo").max(50),
  /** Their linked quote lines (TodoQuoteLine ids) to charge too. */
  quoteLinkIds: z.array(z.number().int().positive()).max(200).default([]),
});

async function customerOf(params: Promise<{ id: string }>) {
  const id = Number((await params).id);
  if (!Number.isInteger(id) || id <= 0) throw new ApiError("Ongeldig klant-id", 400);
  const customer = await db.customer.findUnique({ where: { id }, select: { id: true, isDemo: true } });
  if (!customer) throw new ApiError("Klant niet gevonden", 404);
  return customer;
}

/** GET /api/customers/:id/invoice — finished work of the customer that is not invoiced yet. */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireUser();
    const customer = await customerOf(params);
    return NextResponse.json(await loadUninvoicedJobs(customer.id));
  } catch (error) {
    return handleApiError(error);
  }
}

/**
 * POST /api/customers/:id/invoice — one invoice for several finished todos of
 * the customer (afterwards, e.g. when "samen factureren" was forgotten during
 * the registration, or a monthly invoice). Made and pushed exactly like at
 * the registration (services/job-close.ts).
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireUser();
    const customer = await customerOf(params);
    const { todoIds, quoteLinkIds } = bodySchema.parse(await request.json());

    const created = await db.$transaction(async (tx) => {
      const [first, ...others] = todoIds;
      const main = await tx.todo.findUnique({
        where: { id: first },
        select: {
          customerId: true,
          status: true,
          isProject: true,
          _count: { select: { appointments: { where: { completion: { invoiceId: null } } } } },
        },
      });
      const problem = main
        ? invoiceTogetherProblem({ ...main, uninvoicedDays: main._count.appointments }, customer.id)
        : "Todo niet gevonden.";
      if (problem) throw new ApiError(`Kan todo #${first} niet factureren: ${problem}`, 409);

      // The most recent open registration of these todos "makes" the invoice.
      const trigger = await tx.completion.findFirst({
        where: { invoiceId: null, appointment: { todoId: { in: todoIds } } },
        orderBy: [{ appointment: { startAt: "desc" } }, { id: "desc" }],
        select: { id: true },
      });
      if (!trigger) throw new ApiError("Er is niets te factureren op deze todo's.", 409);
      return createJobInvoiceInTx(tx, {
        todoId: first,
        alsoTodoIds: others,
        customerId: customer.id,
        triggerCompletionId: trigger.id,
        quoteLinkIds,
      });
    });

    if (!created) throw new ApiError("Er is niets te factureren op deze todo's.", 409);
    const efPush = await pushNewJobInvoice(created.id, customer.isDemo);
    return NextResponse.json({ invoiced: true, invoiceId: created.id, ...created, efPush }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
