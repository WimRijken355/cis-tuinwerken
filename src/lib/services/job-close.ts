import type { Prisma } from "@/generated/prisma/client";
import { contentFromBuilt, vatSummary } from "../invoice-content";
import { ApiError } from "../api";
import { buildInvoice, invoiceTogetherProblem } from "../registration";
import { initialSyncAction, syncSkipMessage } from "./invoice-sync";
import { markInvoiceNotSynced, pushInvoiceToEf } from "./invoices";
import { loadUninvoicedJob } from "./registration";
import { getSettings } from "./settings";

/**
 * Closing a job (todo) and invoicing its registered days. Shared by the
 * registration (POST /api/appointments/:id/complete) and the todo details
 * (POST /api/todos/:id/close), so both follow exactly the same rules.
 */

type Tx = Prisma.TransactionClient;

export interface CreatedJobInvoice {
  id: number;
  totalExclVat: number;
  totalInclVat: number;
}

/** The job is finished: blocks still planned are cancelled and the todo → DONE. */
export async function closeJobInTx(tx: Tx, todoId: number): Promise<void> {
  await tx.appointment.updateMany({ where: { todoId, status: "PLANNED" }, data: { status: "CANCELLED" } });
  await tx.todo.update({ where: { id: todoId }, data: { status: "DONE", completedAt: new Date() } });
}

/**
 * One invoice with every registered, not yet invoiced day of the todo (local,
 * PENDING; pushed afterwards with pushNewJobInvoice), optionally together with
 * other finished todos of the same customer (`alsoTodoIds`, "samen
 * factureren": grouped per todo on the invoice). `triggerCompletionId` is the
 * registration that "made" the invoice. Null when there is nothing to invoice.
 */
export async function createJobInvoiceInTx(
  tx: Tx,
  input: {
    todoId: number;
    customerId: number;
    triggerCompletionId: number;
    remarks?: Record<string, string>;
    notes?: string[];
    /** TodoQuoteLine ids to charge too (of the todos on this invoice, not invoiced yet). */
    quoteLinkIds?: number[];
    /** Other finished todos of this customer to put on the same invoice. */
    alsoTodoIds?: number[];
  },
): Promise<CreatedJobInvoice | null> {
  const alsoTodoIds = [...new Set(input.alsoTodoIds ?? [])].filter((id) => id !== input.todoId);
  for (const id of alsoTodoIds) {
    const other = await tx.todo.findUnique({
      where: { id },
      select: {
        customerId: true,
        status: true,
        isProject: true,
        _count: { select: { appointments: { where: { completion: { invoiceId: null } } } } },
      },
    });
    const problem = other
      ? invoiceTogetherProblem({ ...other, uninvoicedDays: other._count.appointments }, input.customerId)
      : "Todo niet gevonden.";
    if (problem) throw new ApiError(`Kan todo #${id} niet mee factureren: ${problem}`, 409);
  }

  const todoIds = [input.todoId, ...alsoTodoIds];
  const chosen = new Set(input.quoteLinkIds ?? []);
  const jobs = [];
  for (const id of todoIds) {
    const job = await loadUninvoicedJob(id, tx);
    jobs.push({ ...job, quoteLines: (job.quoteLines ?? []).filter((l) => chosen.has(l.linkId)) });
  }
  if (jobs.every((j) => j.days.length === 0)) return null;

  const built = buildInvoice({ jobs, remarks: input.remarks ?? {}, notes: input.notes ?? [] });
  const invoice = await tx.invoice.create({
    data: {
      completionId: input.triggerCompletionId,
      customerId: input.customerId,
      pushStatus: "PENDING",
      linesJson: built.items as unknown as object,
      // Editable structure (lines + remarks, notes) while not yet in EF.
      contentJson: contentFromBuilt(built) as unknown as object,
      totalExclVat: built.totalExclVat,
    },
  });
  await tx.completion.updateMany({
    where: { invoiceId: null, appointment: { todoId: { in: todoIds } } },
    data: { invoiceId: invoice.id },
  });
  const chargedLinks = jobs.flatMap((j) => (j.quoteLines ?? []).map((l) => l.linkId));
  if (chargedLinks.length > 0) {
    await tx.todoQuoteLine.updateMany({
      where: { id: { in: chargedLinks }, todoId: { in: todoIds }, invoiceId: null },
      data: { invoiceId: invoice.id },
    });
  }
  return { id: invoice.id, totalExclVat: built.totalExclVat, totalInclVat: vatSummary(built.items).inclVat };
}

export type EfPushResult =
  | { ok: true; efInvoiceId?: number }
  | { ok: false; skipped: true; message: string }
  | { ok: false; error: string };

/**
 * Step 2 (outside the transaction, never blocking): push a new job invoice to
 * EF as concept, unless sync or automatic sync is off, or it is a demo customer.
 */
export async function pushNewJobInvoice(invoiceId: number, customerIsDemo: boolean): Promise<EfPushResult> {
  const settings = await getSettings();
  if (initialSyncAction(settings.efInvoiceSyncEnabled, customerIsDemo, settings.efInvoiceAutoSync) === "skip") {
    await markInvoiceNotSynced(invoiceId);
    return {
      ok: false,
      skipped: true,
      message: syncSkipMessage(settings.efInvoiceSyncEnabled, customerIsDemo, settings.efInvoiceAutoSync),
    };
  }
  const push = await pushInvoiceToEf(invoiceId);
  return push.ok ? { ok: true, efInvoiceId: push.efInvoiceId } : { ok: false, error: push.error ?? "Onbekende fout" };
}

