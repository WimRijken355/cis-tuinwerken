"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiSend } from "@/lib/api-client";
import { toggleId } from "@/lib/registration";
import type { CustomerQuotesResponse, QuoteDto } from "@/lib/schemas/quotes";
import { ErrorNote } from "./ui";

const euro = new Intl.NumberFormat("nl-BE", { style: "currency", currency: "EUR" });

/** Quotes to show in the picker: linkable ones, plus any quote with a line already chosen. */
export function visibleQuotes(quotes: QuoteDto[], selected: Set<number>): QuoteDto[] {
  return quotes.filter((q) => q.linkable || q.lines.some((l) => selected.has(l.id)));
}

/**
 * Lets the user tick lines of the customer's EenvoudigFactureren quotes
 * (open/accepted) to link to the todo; they are proposed again in the invoice
 * step of the registration. Lines already invoiced through this todo stay
 * ticked and locked. "Ophalen uit EF" refreshes this customer's quotes now.
 */
export function QuoteLinePicker({
  customerId,
  todoId,
  value,
  onChange,
}: {
  customerId: number;
  /** The todo being edited (undefined for a new todo). */
  todoId?: number;
  value: number[];
  onChange: (ids: number[]) => void;
}) {
  const queryClient = useQueryClient();
  const queryKey = ["customer-quotes", customerId];
  const { data, isLoading } = useQuery({
    queryKey,
    queryFn: () => apiGet<CustomerQuotesResponse>(`/api/customers/${customerId}/quotes`),
  });
  const refresh = useMutation({
    mutationFn: () => apiSend(`/api/customers/${customerId}/quotes`, "POST"),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey }),
  });

  if (isLoading || !data?.linkedToEf) return null;
  const selected = new Set(value);
  const quotes = visibleQuotes(data.quotes, selected);

  return (
    <div role="group" aria-label="Offertelijnen" className="rounded-md border border-gray-200 p-3">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-sm font-medium text-gray-700">Offertelijnen (optioneel)</span>
        <button
          type="button"
          className="text-xs text-brand-600 hover:underline disabled:opacity-50"
          disabled={refresh.isPending}
          onClick={() => refresh.mutate()}
        >
          {refresh.isPending ? "Ophalen…" : "↻ Ophalen uit EF"}
        </button>
      </div>
      {refresh.error && <ErrorNote message={(refresh.error as Error).message} />}
      {quotes.length === 0 ? (
        <p className="mt-1 text-xs text-gray-500">Geen open of aanvaarde offertes voor deze klant.</p>
      ) : (
        <>
          <p className="mt-1 text-xs text-gray-500">
            Aangevinkte lijnen worden voorgesteld bij het factureren (klaarmelden).
          </p>
          <div className="mt-2 max-h-72 space-y-3 overflow-y-auto">
            {quotes.map((q) => (
              <div key={q.id}>
                <p className="text-xs font-semibold text-gray-600">
                  Offerte {q.number} · {q.date.split("-").reverse().join("/")} · {q.statusLabel}
                  {q.reference ? ` · ${q.reference}` : ""}
                </p>
                <ul className="mt-1 divide-y divide-gray-100">
                  {q.lines.map((l) => {
                    const lockedInvoiced = l.invoiced && todoId !== undefined && l.linkedTodoIds.includes(todoId);
                    const elsewhere = l.linkedTodoIds.filter((id) => id !== todoId).length > 0;
                    return (
                      <li key={l.id}>
                        <label className="flex min-h-11 items-start gap-3 py-1.5">
                          <input
                            type="checkbox"
                            className="mt-0.5 h-5 w-5 shrink-0"
                            checked={selected.has(l.id)}
                            disabled={lockedInvoiced}
                            onChange={() => onChange([...toggleId(selected, l.id)])}
                          />
                          <span className="min-w-0 flex-1 text-sm">
                            <span className="block leading-snug">{l.description}</span>
                            <span className="block text-xs text-gray-500">
                              {String(l.quantity).replace(".", ",")} {l.unit} × {euro.format(l.amount)} · {l.taxRate}% btw
                              {lockedInvoiced && " · al gefactureerd"}
                              {!lockedInvoiced && l.invoiced && " · al gefactureerd via een andere todo"}
                              {!l.invoiced && elsewhere && " · ook gekoppeld aan een andere todo"}
                            </span>
                          </span>
                          <span className="shrink-0 text-sm tabular-nums">{euro.format(l.quantity * l.amount)}</span>
                        </label>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
