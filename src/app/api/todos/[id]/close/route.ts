import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { ApiError, handleApiError, requireUser } from "@/lib/api";
import { db } from "@/lib/db";
import { closeJobCheck } from "@/lib/registration";
import { closeJobInTx, createJobInvoiceInTx, pushNewJobInvoice } from "@/lib/services/job-close";

const bodySchema = z.object({
  /** true = invoice every registered day not invoiced yet (and close); false = close without invoice. */
  invoice: z.boolean(),
});

/**
 * POST /api/todos/:id/close — close a job afterwards from the todo's details,
 * e.g. when the last day was registered without "job afgewerkt": with or
 * without invoicing its open days (rules: closeJobCheck). The invoice is made
 * and pushed exactly like at the registration (services/job-close.ts).
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireUser();
    const id = Number((await params).id);
    if (!Number.isInteger(id) || id <= 0) throw new ApiError("Ongeldig todo-id", 400);
    const { invoice } = bodySchema.parse(await request.json());

    const todo = await db.todo.findUnique({
      where: { id },
      include: {
        customer: { select: { id: true, isDemo: true } },
        appointments: {
          select: {
            status: true,
            completion: {
              select: {
                id: true,
                invoiceId: true,
                laborEntries: { select: { invoicedHours: true } },
                _count: { select: { extraCharges: true } },
              },
            },
          },
        },
      },
    });
    if (!todo) throw new ApiError("Todo niet gevonden", 404);
    const completions = todo.appointments.flatMap((a) => (a.completion ? [a.completion] : []));
    const uninvoiced = completions.filter((c) => c.invoiceId === null);
    const check = closeJobCheck(
      {
        status: todo.status,
        hasCustomer: todo.customer !== null,
        plannedBlocks: todo.appointments.filter((a) => a.status === "PLANNED").length,
        registeredDays: completions.length,
        uninvoicedDays: uninvoiced.length,
        hasBillable: uninvoiced.some(
          (c) => c.laborEntries.some((l) => Number(l.invoicedHours) > 0) || c._count.extraCharges > 0,
        ),
      },
      invoice,
    );
    if (!check.allowed) throw new ApiError(check.reason, 409);

    const created = await db.$transaction(async (tx) => {
      const inv =
        invoice && todo.customer
          ? await createJobInvoiceInTx(tx, {
              todoId: id,
              customerId: todo.customer.id,
              // The most recent open registration "makes" the invoice.
              triggerCompletionId: Math.max(...uninvoiced.map((c) => c.id)),
            })
          : null;
      if (todo.status !== "DONE") await closeJobInTx(tx, id);
      return inv;
    });

    if (!created) return NextResponse.json({ closed: true, invoiced: false });
    const efPush = await pushNewJobInvoice(created.id, todo.customer?.isDemo ?? false);
    return NextResponse.json({ closed: true, invoiced: true, invoiceId: created.id, ...created, efPush });
  } catch (error) {
    return handleApiError(error);
  }
}
