"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { apiGet, apiSend } from "@/lib/api-client";
import { vatSummary } from "@/lib/invoice-content";
import { customerInvoiceMessage, previewCustomerInvoice, type CreatedInvoice } from "@/lib/customer-invoice";
import { selectQuoteLines, toggleId } from "@/lib/registration";
import type { UninvoicedJobDto } from "@/lib/schemas/completions";
import { toBrussels } from "@/lib/time";
import { Button, ErrorNote, Modal, Spinner } from "./ui";
import { VatTotals } from "./vat-totals";

const euro = new Intl.NumberFormat("nl-BE", { style: "currency", currency: "EUR" });

/**
 * Customer page → "Factuur maken": one invoice for several finished todos of
 * the customer that are not invoiced yet (e.g. "samen factureren" forgotten
 * during the registration, or a monthly invoice). Everything ticked by default.
 */
export function CustomerInvoiceDialog({
  customerId,
  onClose,
  onDone,
}: {
  customerId: number;
  onClose: () => void;
  onDone: (message: string) => void;
}) {
  const { data: jobs, isLoading, error } = useQuery({
    queryKey: ["customer-uninvoiced", customerId],
    queryFn: () => apiGet<UninvoicedJobDto[]>(`/api/customers/${customerId}/invoice`),
  });
  const [todoIds, setTodoIds] = useState<Set<number> | null>(null);
  const [quoteLinkIds, setQuoteLinkIds] = useState<Set<number> | null>(null);
  const ticked = todoIds ?? new Set((jobs ?? []).map((j) => j.todoId));
  const tickedLinks = quoteLinkIds ?? new Set((jobs ?? []).flatMap((j) => j.quoteLines.map((l) => l.linkId)));

  const preview = useMemo(() => {
    try {
      return { built: previewCustomerInvoice(jobs ?? [], ticked, tickedLinks), error: null as string | null };
    } catch (e) {
      return { built: null, error: (e as Error).message };
    }
  }, [jobs, ticked, tickedLinks]);

  const create = useMutation({
    mutationFn: () =>
      apiSend<CreatedInvoice>(`/api/customers/${customerId}/invoice`, "POST", {
        todoIds: (jobs ?? []).filter((j) => ticked.has(j.todoId)).map((j) => j.todoId),
        quoteLinkIds: (jobs ?? [])
          .filter((j) => ticked.has(j.todoId))
          .flatMap((j) => selectQuoteLines(j.quoteLines, tickedLinks).map((l) => l.linkId)),
      }),
    onSuccess: (r) => onDone(customerInvoiceMessage(r)),
  });

  return (
    <Modal title="Factuur maken" open onClose={onClose} wide>
      {isLoading && <Spinner />}
      {error && <ErrorNote message={(error as Error).message} />}
      {jobs && jobs.length === 0 && (
        <p className="text-sm text-gray-500">Er is geen afgewerkt werk meer dat nog gefactureerd moet worden.</p>
      )}
      {jobs && jobs.length > 0 && (
        <div className="space-y-4 text-sm">
          <p className="text-xs text-gray-500">
            Afgewerkt werk van deze klant dat nog niet gefactureerd is. Het aangevinkte komt op één factuur, gegroepeerd
            per todo.
          </p>
          <ul className="divide-y divide-gray-100 rounded-lg border border-gray-200">
            {jobs.map((j) => (
              <li key={j.todoId} className="px-3 py-2">
                <label className="flex min-h-11 items-start gap-3">
                  <input
                    type="checkbox"
                    className="mt-1 h-5 w-5 shrink-0"
                    checked={ticked.has(j.todoId)}
                    onChange={() => setTodoIds(toggleId(ticked, j.todoId))}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block font-medium">{j.title}</span>
                    <span className="block text-xs text-gray-500">
                      {j.days.length === 1 ? "1 dag" : `${j.days.length} dagen`}, laatst op{" "}
                      {toBrussels(j.lastRegisteredOn).toFormat("dd/LL/yyyy")}
                    </span>
                  </span>
                </label>
                {ticked.has(j.todoId) && j.quoteLines.length > 0 && (
                  <ul className="ml-8 mt-1 space-y-1">
                    {j.quoteLines.map((l) => (
                      <li key={l.linkId}>
                        <label className="flex min-h-9 items-start gap-2 text-xs">
                          <input
                            type="checkbox"
                            className="mt-0.5 h-4 w-4 shrink-0"
                            checked={tickedLinks.has(l.linkId)}
                            onChange={() => setQuoteLinkIds(toggleId(tickedLinks, l.linkId))}
                          />
                          <span className="min-w-0 flex-1">
                            Offerte {l.quoteNumber}: {l.description}
                          </span>
                          <span className="shrink-0 tabular-nums">{euro.format(l.quantity * l.amount)}</span>
                        </label>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ul>

          {preview.error && <ErrorNote message={preview.error} />}
          {preview.built && preview.built.lines.length > 0 && (
            <div className="ml-auto max-w-xs">
              <VatTotals summary={vatSummary(preview.built.items)} />
            </div>
          )}
          {create.error && <ErrorNote message={(create.error as Error).message} />}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={onClose}>
              Annuleren
            </Button>
            <Button
              type="button"
              disabled={create.isPending || ticked.size === 0 || !preview.built || preview.built.lines.length === 0}
              onClick={() => create.mutate()}
            >
              {create.isPending ? "Bezig…" : "🧾 Factuur maken"}
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
