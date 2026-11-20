"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { apiGet, apiSend } from "@/lib/api-client";
import { toggleId } from "@/lib/registration";
import type { CustomerQuotesResponse } from "@/lib/schemas/quotes";
import type { QuoteSyncResult } from "@/lib/services/quotes";
import { Button, ErrorNote } from "./ui";

const euro = new Intl.NumberFormat("nl-BE", { style: "currency", currency: "EUR" });

/** "Offertes ophalen" result as shown to the user. */
export function quoteSyncMessage(r: QuoteSyncResult): string {
  if (r.quotes === 0) return "Geen offertes gevonden in EenvoudigFactureren.";
  return `${r.quotes} offerte${r.quotes === 1 ? "" : "s"} opgehaald (${r.lines} lijn${r.lines === 1 ? "" : "en"}).`;
}

/**
 * Customer page: the customer's quotes from EenvoudigFactureren (synced daily)
 * and a button to fetch them right now. Hidden for customers not linked to EF.
 */
export function CustomerQuotes({ customerId, efLinked }: { customerId: number; efLinked: boolean }) {
  const queryClient = useQueryClient();
  const queryKey = ["customer-quotes", customerId];
  const [message, setMessage] = useState<string | null>(null);
  // Quotes opened to show their lines.
  const [open, setOpen] = useState<Set<number>>(new Set());
  const { data } = useQuery({
    queryKey,
    queryFn: () => apiGet<CustomerQuotesResponse>(`/api/customers/${customerId}/quotes`),
    enabled: efLinked,
  });
  const sync = useMutation({
    mutationFn: () => apiSend<QuoteSyncResult>(`/api/customers/${customerId}/quotes`, "POST"),
    onSuccess: (r) => {
      setMessage(quoteSyncMessage(r));
      void queryClient.invalidateQueries({ queryKey });
    },
  });

  if (!efLinked) return null;
  const quotes = data?.quotes ?? [];

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h2 className="font-semibold">Offertes ({quotes.length})</h2>
        <Button variant="secondary" onClick={() => sync.mutate()} disabled={sync.isPending}>
          {sync.isPending ? "Ophalen…" : "↻ Offertes ophalen"}
        </Button>
      </div>
      {sync.error && <ErrorNote message={(sync.error as Error).message} />}
      {message && <p className="mb-2 text-xs text-brand-700">{message}</p>}
      {quotes.length === 0 ? (
        <p className="text-sm text-gray-500">
          Nog geen offertes. Ze worden elke nacht uit EenvoudigFactureren gehaald, of meteen met de knop.
        </p>
      ) : (
        <ul className="divide-y divide-gray-100 text-sm">
          {quotes.map((q) => {
            const expanded = open.has(q.id);
            return (
              <li key={q.id}>
                <button
                  type="button"
                  aria-expanded={expanded}
                  onClick={() => setOpen((ids) => toggleId(ids, q.id))}
                  className="flex min-h-11 w-full items-baseline justify-between gap-2 py-1.5 text-left hover:bg-gray-50"
                >
                  <span className="min-w-0">
                    <span className="mr-1 inline-block w-3 text-gray-400">{expanded ? "▾" : "▸"}</span>
                    <span className="font-medium">{q.number}</span>{" "}
                    <span className="text-xs text-gray-500">
                      {q.date.split("-").reverse().join("/")} · {q.statusLabel} · {q.lines.length} lijn
                      {q.lines.length === 1 ? "" : "en"}
                      {q.reference ? ` · ${q.reference}` : ""}
                    </span>
                  </span>
                  <span className="shrink-0 tabular-nums text-gray-700">{euro.format(q.totalExclVat)}</span>
                </button>
                {expanded && (
                  <div className="mb-2 ml-4 overflow-x-auto rounded border border-gray-100">
                    {q.lines.length === 0 ? (
                      <p className="px-2 py-1.5 text-xs text-gray-500">Geen geprijsde lijnen.</p>
                    ) : (
                      <table className="w-full min-w-[420px] text-xs">
                        <thead className="bg-gray-50 text-left uppercase tracking-wide text-gray-500">
                          <tr>
                            <th className="px-2 py-1">Omschrijving</th>
                            <th className="px-2 py-1 text-right">Aantal</th>
                            <th className="px-2 py-1 text-right">Prijs</th>
                            <th className="px-2 py-1 text-right">Btw</th>
                            <th className="px-2 py-1 text-right">Totaal</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                          {q.lines.map((l) => (
                            <tr key={l.id}>
                              <td className="px-2 py-1">
                                {l.description}
                                {l.invoiced && <span className="ml-1 text-green-700">· gefactureerd</span>}
                                {!l.invoiced && l.linkedTodoIds.length > 0 && (
                                  <span className="ml-1 text-brand-700">· gekoppeld aan een todo</span>
                                )}
                              </td>
                              <td className="whitespace-nowrap px-2 py-1 text-right tabular-nums">
                                {String(l.quantity).replace(".", ",")} {l.unit}
                              </td>
                              <td className="whitespace-nowrap px-2 py-1 text-right tabular-nums">{euro.format(l.amount)}</td>
                              <td className="px-2 py-1 text-right tabular-nums">{l.taxRate}%</td>
                              <td className="whitespace-nowrap px-2 py-1 text-right tabular-nums">
                                {euro.format(l.quantity * l.amount)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
