"use client";

import { useState } from "react";
import type { InvoiceDto } from "@/lib/schemas/completions";
import { formatDateShort } from "@/lib/time";
import { InvoiceDetailDialog } from "./invoice-detail";
import { EmptyState, StatusBadge } from "./ui";

const euro = new Intl.NumberFormat("nl-BE", { style: "currency", currency: "EUR" });

/**
 * Customer page → "Facturen": all invoices of the customer (newest first),
 * each opening the same invoice window as Facturen (details, edit, send to EF).
 */
export function CustomerInvoices({ invoices, onChanged }: { invoices: InvoiceDto[]; onChanged: () => void }) {
  const [detailId, setDetailId] = useState<number | null>(null);
  const total = invoices.reduce((sum, inv) => sum + inv.totalInclVat, 0);

  return (
    <section className="rounded-lg border border-gray-200 bg-white">
      {invoices.length === 0 ? (
        <div className="p-4">
          <EmptyState>Nog geen facturen voor deze klant.</EmptyState>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-sm">
            <thead className="bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
              <tr>
                <th className="px-3 py-2">Datum</th>
                <th className="px-3 py-2">Werk</th>
                <th className="px-3 py-2 text-right">Incl. btw</th>
                <th className="px-3 py-2">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {invoices.map((inv) => (
                <tr
                  key={inv.id}
                  className="cursor-pointer hover:bg-gray-50"
                  onClick={() => setDetailId(inv.id)}
                  title="Factuur openen"
                >
                  <td className="whitespace-nowrap px-3 py-2 tabular-nums">{formatDateShort(inv.workDate)}</td>
                  <td className="max-w-[18rem] truncate px-3 py-2">
                    <button type="button" className="text-left text-brand-700 hover:underline">
                      {inv.workTitle}
                    </button>
                    {inv.errorMessage && <span className="ml-2 text-xs text-red-600">⚠ push mislukt</span>}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-right font-medium tabular-nums">
                    {euro.format(inv.totalInclVat)}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2">
                    <StatusBadge status={inv.pushStatus} />
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-gray-200 text-gray-600">
                <td className="px-3 py-2" colSpan={2}>
                  {invoices.length} factu{invoices.length === 1 ? "ur" : "ren"}
                </td>
                <td className="whitespace-nowrap px-3 py-2 text-right font-semibold tabular-nums">{euro.format(total)}</td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      )}
      {detailId !== null && (
        <InvoiceDetailDialog
          invoiceId={detailId}
          onClose={() => {
            setDetailId(null);
            onChanged();
          }}
        />
      )}
    </section>
  );
}
