import type { Prisma } from "@/generated/prisma/client";
import { contentFromBuilt, vatSummary } from "../invoice-content";
import { buildJobInvoice } from "../registration";
import { initialSyncAction, syncSkipMessage } from "./invoice-sync";
import { markInvoiceNotSynced, pushInvoiceToEf } from "./invoices";
import { loadUninvoicedDays } from "./registration";
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
 * PENDING; pushed afterwards with pushNewJobInvoice). `triggerCompletionId` is
 * the registration that "made" the invoice. Null when there is nothing to invoice.
 */
export async function createJobInvoiceInTx(
  tx: Tx,
  input: {
    todoId: number;
    customerId: number;
    triggerCompletionId: number;
    remarks?: Record<string, string>;
    notes?: string[];
  },
): Promise<CreatedJobInvoice | null> {
  const days = await loadUninvoicedDays(input.todoId, tx);
  if (days.length === 0) return null;
  const built = buildJobInvoice({ days, remarks: input.remarks ?? {}, notes: input.notes ?? [] });
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
    where: { invoiceId: null, appointment: { todoId: input.todoId } },
    data: { invoiceId: invoice.id },
  });
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

