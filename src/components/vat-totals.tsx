"use client";

import type { VatSummary } from "@/lib/invoice-content";

const euro = new Intl.NumberFormat("nl-BE", { style: "currency", currency: "EUR" });

/** "Totaal excl. btw / Btw 21% over … / Totaal incl. btw" block under an invoice. */
export function VatTotals({ summary }: { summary: VatSummary }) {
  return (
    <dl className="space-y-0.5 text-sm">
      <div className="flex justify-between">
        <dt>Totaal excl. btw</dt>
        <dd className="tabular-nums">{euro.format(summary.exclVat)}</dd>
      </div>
      {summary.perRate.map((r) => (
        <div key={r.rate} className="flex justify-between text-gray-500">
          <dt>
            Btw {r.rate}% <span className="text-xs">over {euro.format(r.base)}</span>
          </dt>
          <dd className="tabular-nums">{euro.format(r.vat)}</dd>
        </div>
      ))}
      <div className="flex justify-between border-t border-gray-200 pt-1 text-base font-semibold">
        <dt>Totaal incl. btw</dt>
        <dd className="tabular-nums">{euro.format(summary.inclVat)}</dd>
      </div>
    </dl>
  );
}
