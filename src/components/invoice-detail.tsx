"use client";

import { useQuery } from "@tanstack/react-query";
import { ErrorNote, Modal, Spinner, StatusBadge } from "@/components/ui";
import { apiGet } from "@/lib/api-client";
import type { InvoiceDetailDto } from "@/lib/schemas/completions";
import { formatDate, formatDateShort } from "@/lib/time";

const euro = new Intl.NumberFormat("nl-BE", { style: "currency", currency: "EUR" });
const hours = (h: number) => `${String(h).replace(".", ",")} u`;

/**
 * Invoice detail: (1) exactly what was sent to EenvoudigFactureren (incl.
 * remark / note text lines), (2) per registered day the hours per resource —
 * how each "Werkuren op <datum>" line was composed — and the total invoiced
 * hours per resource. (2) is for consultation only.
 */
export function InvoiceDetailDialog({ invoiceId, onClose }: { invoiceId: number; onClose: () => void }) {
  const { data, isLoading, error } = useQuery({
    queryKey: ["invoice", invoiceId],
    queryFn: () => apiGet<InvoiceDetailDto>(`/api/invoices/${invoiceId}`),
  });

  return (
    <Modal title={data ? `Factuur ${data.customerName}` : "Factuur"} open onClose={onClose} wide>
      {isLoading && <Spinner />}
      {error && <ErrorNote message={(error as Error).message} />}
      {data && <InvoiceDetail invoice={data} />}
    </Modal>
  );
}

function InvoiceDetail({ invoice: inv }: { invoice: InvoiceDetailDto }) {
  // Total invoiced/registered hours per resource over all days of this invoice.
  const perResource = new Map<string, { type: string; registered: number; invoiced: number }>();
  for (const day of inv.days) {
    for (const l of day.labor) {
      const r = perResource.get(l.name) ?? { type: l.type, registered: 0, invoiced: 0 };
      r.registered += l.registeredHours;
      r.invoiced += l.invoicedHours;
      perResource.set(l.name, r);
    }
  }

  return (
    <div className="space-y-5 text-sm">
      <div className="flex flex-wrap items-center gap-2 text-gray-600">
        <span>{inv.workTitle}</span>·<span>aangemaakt {formatDateShort(inv.createdAt)}</span>
        <StatusBadge status={inv.pushStatus} />
        {inv.efInvoiceId && <span className="text-xs text-gray-400">EF #{inv.efInvoiceId}</span>}
      </div>
      {inv.errorMessage && <ErrorNote message={inv.errorMessage} />}

      <section>
        <h3 className="mb-1 font-semibold">Naar EenvoudigFactureren</h3>
        <div className="overflow-x-auto rounded-lg border border-gray-200">
          <table className="w-full">
            <thead className="bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
              <tr>
                <th className="px-3 py-2">Omschrijving</th>
                <th className="px-3 py-2 text-right">Aantal</th>
                <th className="px-3 py-2 text-right">Prijs</th>
                <th className="px-3 py-2 text-right">Btw</th>
                <th className="px-3 py-2 text-right">Totaal</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {inv.items.map((item, i) =>
                item.type === "text" ? (
                  <tr key={i}>
                    <td colSpan={5} className="px-3 py-1.5 italic text-gray-600">
                      💬 {item.description}
                    </td>
                  </tr>
                ) : (
                  <tr key={i}>
                    <td className="px-3 py-2">{item.description}</td>
                    <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">
                      {String(item.quantity).replace(".", ",")} {item.unit}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">{euro.format(item.amount ?? 0)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{item.tax_rate}%</td>
                    <td className="whitespace-nowrap px-3 py-2 text-right font-medium tabular-nums">
                      {euro.format((item.quantity ?? 0) * (item.amount ?? 0))}
                    </td>
                  </tr>
                ),
              )}
            </tbody>
            <tfoot>
              <tr className="border-t border-gray-200 font-semibold">
                <td colSpan={4} className="px-3 py-2">
                  Totaal excl. btw
                </td>
                <td className="px-3 py-2 text-right tabular-nums">{euro.format(inv.totalExclVat)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </section>

      {inv.days.length > 0 && (
        <section>
          <h3 className="font-semibold">Gefactureerde uren per resource</h3>
          <p className="mb-1 text-xs text-gray-500">
            Ter info (niet op de factuur): zo is elke regel &quot;Werkuren op &lt;datum&gt;&quot; samengesteld.
          </p>
          <div className="space-y-3">
            {inv.days.map((day) => {
              const people = day.labor.filter((l) => l.type === "PERSON");
              const peopleInvoiced = people.reduce((s, l) => s + l.invoicedHours, 0);
              return (
                <div key={day.date} className="rounded-lg border border-gray-200">
                  <p className="border-b border-gray-100 bg-gray-50 px-3 py-1.5 text-xs font-semibold capitalize text-gray-600">
                    {formatDate(day.date)}
                  </p>
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead className="text-left text-xs text-gray-500">
                        <tr>
                          <th className="px-3 py-1">Resource</th>
                          <th className="px-3 py-1 text-right">Geregistreerd</th>
                          <th className="px-3 py-1 text-right">Gefactureerd</th>
                          <th className="px-3 py-1 text-right">Tarief</th>
                        </tr>
                      </thead>
                      <tbody>
                        {day.labor.map((l, i) => (
                          <tr key={i}>
                            <td className="px-3 py-1">
                              {l.type === "PERSON" ? "👷" : "🚜"} {l.name}
                            </td>
                            <td className="px-3 py-1 text-right tabular-nums text-gray-500">{hours(l.registeredHours)}</td>
                            <td
                              className={`px-3 py-1 text-right tabular-nums ${
                                l.invoicedHours !== l.registeredHours ? "font-semibold text-amber-700" : ""
                              }`}
                            >
                              {hours(l.invoicedHours)}
                            </td>
                            <td className="px-3 py-1 text-right tabular-nums text-gray-500">{euro.format(l.hourlyRate)}/u</td>
                          </tr>
                        ))}
                        {day.extras.map((e, i) => (
                          <tr key={`x${i}`} className="text-gray-500">
                            <td className="px-3 py-1">📦 {e.description}</td>
                            <td />
                            <td className="px-3 py-1 text-right tabular-nums">
                              {String(e.quantity).replace(".", ",")} {e.unit}
                            </td>
                            <td className="px-3 py-1 text-right tabular-nums">{euro.format(e.unitPrice)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {people.length > 0 && (
                    <p className="border-t border-gray-100 px-3 py-1.5 text-xs text-gray-600">
                      → <strong>Werkuren op {formatDateShort(day.date)}</strong>:{" "}
                      {people.map((l) => `${l.name} ${hours(l.invoicedHours)}`).join(" + ")} ={" "}
                      <strong>{hours(peopleInvoiced)}</strong>
                    </p>
                  )}
                  {day.note && <p className="border-t border-gray-100 px-3 py-1.5 text-xs italic text-gray-500">📝 {day.note}</p>}
                </div>
              );
            })}
          </div>

          {perResource.size > 0 && (
            <div className="mt-3 rounded-lg border border-gray-200 p-3">
              <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-500">Totaal per resource</p>
              <ul className="space-y-0.5">
                {[...perResource].map(([name, r]) => (
                  <li key={name} className="flex justify-between">
                    <span>
                      {r.type === "PERSON" ? "👷" : "🚜"} {name}
                    </span>
                    <span className="tabular-nums">
                      {hours(r.invoiced)} gefactureerd
                      <span className="text-gray-400"> · {hours(r.registered)} geregistreerd</span>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
