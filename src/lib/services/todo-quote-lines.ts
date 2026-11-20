import { ApiError } from "../api";
import { db } from "../db";
import { invalidQuoteLineIds, LINKABLE_QUOTE_STATUSES } from "../ef/quotes";
import type { TodoQuoteLineDto } from "../schemas/quotes";

/**
 * Replaces the quote lines linked to a todo. New links must be lines of the
 * customer's own open/accepted quotes; lines already linked stay allowed.
 * Links that were invoiced are never removed (they belong to that invoice).
 * A losse todo (no customer) cannot have quote lines.
 */
export async function replaceTodoQuoteLines(todoId: number, customerId: number | null, quoteLineIds: number[]): Promise<void> {
  const current = await db.todoQuoteLine.findMany({ where: { todoId }, select: { id: true, quoteLineId: true, invoiceId: true } });
  const linked = new Set(current.map((l) => l.quoteLineId));

  let allowed = new Set<number>();
  if (customerId !== null && quoteLineIds.length > 0) {
    const customer = await db.customer.findUnique({ where: { id: customerId }, select: { efClientId: true } });
    if (customer?.efClientId) {
      const lines = await db.efQuoteLine.findMany({
        where: {
          quote: { efClientId: customer.efClientId, status: { in: [...LINKABLE_QUOTE_STATUSES] } },
        },
        select: { id: true },
      });
      allowed = new Set(lines.map((l) => l.id));
    }
  }
  const wanted = customerId === null ? [] : quoteLineIds;
  if (invalidQuoteLineIds(wanted, allowed, linked).length > 0) {
    throw new ApiError("Een of meer offertelijnen horen niet bij een open of aanvaarde offerte van deze klant.", 400);
  }

  const wantedSet = new Set(wanted);
  const toRemove = current.filter((l) => !wantedSet.has(l.quoteLineId) && l.invoiceId === null).map((l) => l.id);
  if (toRemove.length > 0) await db.todoQuoteLine.deleteMany({ where: { id: { in: toRemove } } });
  for (const quoteLineId of wanted.filter((id) => !linked.has(id))) {
    await db.todoQuoteLine.create({ data: { todoId, quoteLineId } });
  }
}

/** The quote lines of a todo (oldest link first), for the editor and the registration. */
export async function loadTodoQuoteLines(
  todoId: number,
  client: Pick<typeof db, "todoQuoteLine"> = db,
): Promise<TodoQuoteLineDto[]> {
  const links = await client.todoQuoteLine.findMany({
    where: { todoId },
    orderBy: { id: "asc" },
    include: { quoteLine: { include: { quote: { select: { number: true } } } } },
  });
  return links.map((l) => ({
    linkId: l.id,
    quoteLineId: l.quoteLineId,
    quoteNumber: l.quoteLine.quote.number,
    description: l.quoteLine.description,
    quantity: Number(l.quoteLine.quantity),
    unit: l.quoteLine.unit,
    amount: Number(l.quoteLine.amount),
    taxRate: Number(l.quoteLine.taxRate),
    invoiceId: l.invoiceId,
  }));
}
