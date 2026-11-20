import { db } from "../db";
import { efIsConfigured, listAllQuotes } from "../ef/client";
import { mapEfQuote, planQuoteCleanup, type MappedQuote } from "../ef/quotes";

/**
 * Mirrors EF quotes (offertes) into EfQuote/EfQuoteLine: daily for all
 * clients (jobs.ts) and on demand for one customer (button on the customer
 * page → POST /api/customers/:id/sync-quotes). Upserts by EF id; lines or
 * quotes that disappeared from EF are removed unless linked to a todo
 * (planQuoteCleanup). EfQuote/EfQuoteLine are not audited (copies of EF data).
 */

export interface QuoteSyncResult {
  quotes: number;
  lines: number;
  removedLines: number;
}

async function storeQuotes(remote: MappedQuote[], efClientId?: number): Promise<QuoteSyncResult> {
  const syncedAt = new Date();
  let lineCount = 0;
  for (const q of remote) {
    const quote = await db.efQuote.upsert({
      where: { efQuoteId: q.efQuoteId },
      create: {
        efQuoteId: q.efQuoteId,
        efClientId: q.efClientId,
        number: q.number,
        reference: q.reference,
        date: q.date,
        status: q.status,
        totalExclVat: q.totalExclVat,
        syncedAt,
      },
      update: {
        efClientId: q.efClientId,
        number: q.number,
        reference: q.reference,
        date: q.date,
        status: q.status,
        totalExclVat: q.totalExclVat,
        syncedAt,
      },
    });
    for (const line of q.lines) {
      const data = {
        quoteId: quote.id,
        sortOrder: line.sortOrder,
        description: line.description,
        quantity: line.quantity,
        unit: line.unit,
        amount: line.amount,
        taxRate: line.taxRate,
      };
      await db.efQuoteLine.upsert({
        where: { efItemId: line.efItemId },
        create: { efItemId: line.efItemId, ...data },
        update: data,
      });
      lineCount++;
    }
  }

  // Cleanup within the sync's scope (one client, or everything).
  const local = await db.efQuote.findMany({
    where: efClientId ? { efClientId } : {},
    select: {
      efQuoteId: true,
      lines: { select: { efItemId: true, _count: { select: { todoLinks: true } } } },
    },
  });
  const plan = planQuoteCleanup({
    local: local.map((q) => ({
      efQuoteId: q.efQuoteId,
      lines: q.lines.map((l) => ({ efItemId: l.efItemId, linked: l._count.todoLinks > 0 })),
    })),
    remote,
  });
  if (plan.deleteLineItemIds.length > 0) {
    await db.efQuoteLine.deleteMany({ where: { efItemId: { in: plan.deleteLineItemIds } } });
  }
  if (plan.deleteQuoteIds.length > 0) {
    await db.efQuote.deleteMany({ where: { efQuoteId: { in: plan.deleteQuoteIds } } });
  }
  return { quotes: remote.length, lines: lineCount, removedLines: plan.deleteLineItemIds.length };
}

/** All quotes of all clients (daily job). Skipped when EF is not configured. */
export async function syncAllQuotes(): Promise<QuoteSyncResult | null> {
  if (!efIsConfigured()) return null;
  const remote = (await listAllQuotes()).map(mapEfQuote);
  return storeQuotes(remote);
}

/** The quotes of one EF client, right now (customer page button). */
export async function syncQuotesForClient(efClientId: number): Promise<QuoteSyncResult> {
  const remote = (await listAllQuotes(efClientId)).map(mapEfQuote).filter((q) => q.efClientId === efClientId);
  return storeQuotes(remote, efClientId);
}

/** Daily job wrapper: logs instead of throwing. */
export async function runQuoteSyncJob(): Promise<void> {
  const result = await syncAllQuotes();
  if (result) console.log(`📄 Offertes gesynchroniseerd: ${result.quotes} offertes, ${result.lines} lijnen`);
}
