"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Button, ErrorNote, Modal, Spinner, StatusBadge, TextInput } from "@/components/ui";
import { VatTotals } from "@/components/vat-totals";
import { apiGet, apiSend } from "@/lib/api-client";
import { itemsFromContent, vatSummary, type InvoiceContent } from "@/lib/invoice-content";
import { searchArticles } from "@/lib/registration";
import type { PriceListItemDto } from "@/lib/schemas/catalog";
import type { InvoiceDetailDto } from "@/lib/schemas/completions";
import { formatDate, formatDateShort } from "@/lib/time";

const euro = new Intl.NumberFormat("nl-BE", { style: "currency", currency: "EUR" });
const hours = (h: number) => `${String(h).replace(".", ",")} u`;
const num = (v: string) => Number(v.replace(",", "."));
const show = (n: number) => String(n).replace(".", ",");

/**
 * Invoice detail: (1) exactly what was sent to EenvoudigFactureren (incl.
 * remark / note text lines) with totals excl./incl. VAT, (2) per registered
 * day the hours per resource — how each "Werkuren op <datum>" line was
 * composed (consultation only). While the invoice is not in EF yet it can be
 * edited here (InvoiceEditor).
 */
export function InvoiceDetailDialog({ invoiceId, onClose }: { invoiceId: number; onClose: () => void }) {
  const [editing, setEditing] = useState(false);
  const { data, isLoading, error } = useQuery({
    queryKey: ["invoice", invoiceId],
    queryFn: () => apiGet<InvoiceDetailDto>(`/api/invoices/${invoiceId}`),
  });

  return (
    <Modal
      title={data ? `${editing ? "Factuur aanpassen" : "Factuur"} — ${data.customerName}` : "Factuur"}
      open
      onClose={onClose}
      wide
    >
      {isLoading && <Spinner />}
      {error && <ErrorNote message={(error as Error).message} />}
      {data &&
        (editing ? (
          <InvoiceEditor invoice={data} onDone={() => setEditing(false)} />
        ) : (
          <InvoiceDetail invoice={data} onEdit={() => setEditing(true)} />
        ))}
    </Modal>
  );
}

function InvoiceDetail({ invoice: inv, onEdit }: { invoice: InvoiceDetailDto; onEdit: () => void }) {
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
        {inv.editable && (
          <Button variant="secondary" className="ml-auto" onClick={onEdit}>
            ✏️ Aanpassen
          </Button>
        )}
      </div>
      {inv.errorMessage && <ErrorNote message={inv.errorMessage} />}
      {inv.editedAt && (
        <p className="rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800">
          Factuur manueel aangepast op {formatDateShort(inv.editedAt)} — de uren per resource hieronder tonen de
          registratie zoals ze oorspronkelijk was.
        </p>
      )}

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
                      {show(item.quantity ?? 0)} {item.unit}
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
          </table>
        </div>
        <div className="ml-auto mt-2 max-w-xs">
          <VatTotals summary={vatSummary(inv.items)} />
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
                              {show(e.quantity)} {e.unit}
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

interface EditLine {
  /** Local id, only for React keys. */
  key: number;
  description: string;
  quantity: string;
  unit: string;
  amount: string;
  tax_rate: number;
  remark: string;
  remarkOpen: boolean;
}

let nextKey = 1;

/**
 * Edits an invoice that is not in EenvoudigFactureren yet: description,
 * quantity and price per line, a remark per line, note lines, and adding /
 * removing lines (articles from the price list). Saves the whole content.
 */
function InvoiceEditor({ invoice, onDone }: { invoice: InvoiceDetailDto; onDone: () => void }) {
  const queryClient = useQueryClient();
  const [lines, setLines] = useState<EditLine[]>(() =>
    invoice.content.lines.map((l) => ({
      key: nextKey++,
      description: l.item.description,
      quantity: show(l.item.quantity),
      unit: l.item.unit,
      amount: show(l.item.amount),
      tax_rate: l.item.tax_rate,
      remark: l.remark ?? "",
      remarkOpen: Boolean(l.remark),
    })),
  );
  const [notes, setNotes] = useState<string[]>(invoice.content.notes);
  const [search, setSearch] = useState("");

  const { data: priceList } = useQuery({
    queryKey: ["price-list"],
    queryFn: () => apiGet<PriceListItemDto[]>("/api/price-list"),
  });
  const results = searchArticles(priceList ?? [], search, new Set(), 15);

  const content: InvoiceContent = useMemo(
    () => ({
      lines: lines.map((l) => ({
        item: {
          description: l.description,
          quantity: num(l.quantity),
          unit: l.unit,
          amount: num(l.amount),
          tax_rate: l.tax_rate,
        },
        remark: l.remark.trim() || undefined,
      })),
      notes: notes.map((n) => n.trim()).filter(Boolean),
    }),
    [lines, notes],
  );
  const valid = lines.every((l) => num(l.quantity) > 0 && num(l.amount) >= 0 && l.description.trim());

  const update = (key: number, patch: Partial<EditLine>) =>
    setLines((list) => list.map((l) => (l.key === key ? { ...l, ...patch } : l)));

  const saveMutation = useMutation({
    mutationFn: () => apiSend(`/api/invoices/${invoice.id}`, "PATCH", content),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["invoice", invoice.id] });
      void queryClient.invalidateQueries({ queryKey: ["invoices"] });
      onDone();
    },
  });

  return (
    <div className="space-y-4 text-sm">
      <p className="text-xs text-gray-500">
        Aanpassingen gelden voor de factuur; de geregistreerde uren zelf blijven ongewijzigd.
      </p>
      {saveMutation.error && <ErrorNote message={(saveMutation.error as Error).message} />}

      <ul className="divide-y divide-gray-100 rounded-lg border border-gray-200">
        {lines.map((l) => {
          const total = num(l.quantity) * num(l.amount);
          return (
            <li key={l.key} className="space-y-1.5 p-3">
              <div className="flex gap-2">
                <TextInput
                  aria-label="Omschrijving"
                  value={l.description}
                  maxLength={500}
                  onChange={(e) => update(l.key, { description: e.target.value })}
                />
                <button
                  type="button"
                  aria-label="Regel verwijderen"
                  title="Regel verwijderen"
                  onClick={() => setLines((list) => list.filter((x) => x.key !== l.key))}
                  className="shrink-0 rounded-md px-2 text-red-500 hover:bg-red-50"
                >
                  ✕
                </button>
              </div>
              <div className="flex flex-wrap items-end gap-2">
                <label className="block">
                  <span className="text-[11px] uppercase tracking-wide text-gray-500">Aantal ({l.unit})</span>
                  <TextInput
                    inputMode="decimal"
                    value={l.quantity}
                    onChange={(e) => update(l.key, { quantity: e.target.value })}
                    className="!w-24"
                  />
                </label>
                <label className="block">
                  <span className="text-[11px] uppercase tracking-wide text-gray-500">Prijs (€, excl. btw)</span>
                  <TextInput
                    inputMode="decimal"
                    value={l.amount}
                    onChange={(e) => update(l.key, { amount: e.target.value })}
                    className="!w-28"
                  />
                </label>
                <span className="pb-2 text-gray-500">{l.tax_rate}% btw</span>
                <span className="ml-auto pb-2 font-medium tabular-nums">
                  {Number.isFinite(total) ? euro.format(total) : "–"}
                </span>
              </div>
              {l.remarkOpen ? (
                <TextInput
                  aria-label="Opmerking bij deze regel"
                  placeholder="Opmerking bij deze regel (leeg = geen)…"
                  value={l.remark}
                  maxLength={500}
                  onChange={(e) => update(l.key, { remark: e.target.value })}
                />
              ) : (
                <button type="button" className="text-xs text-brand-600" onClick={() => update(l.key, { remarkOpen: true })}>
                  + opmerking bij deze regel
                </button>
              )}
            </li>
          );
        })}
      </ul>

      <section className="rounded-lg border border-dashed border-gray-300 p-3">
        <p className="mb-1 text-xs font-medium uppercase tracking-wide text-gray-500">Artikel toevoegen</p>
        <TextInput
          type="search"
          placeholder="Zoek in de artikels…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        {search && (
          <ul className="mt-1 divide-y divide-gray-100">
            {results.results.map((p) => (
              <li key={p.id}>
                <button
                  type="button"
                  className="flex w-full justify-between gap-2 py-2 text-left hover:bg-gray-50"
                  onClick={() => {
                    setLines((list) => [
                      ...list,
                      {
                        key: nextKey++,
                        description: p.name,
                        quantity: "1",
                        unit: p.unit,
                        amount: show(p.unitPrice),
                        tax_rate: p.vatRate,
                        remark: "",
                        remarkOpen: false,
                      },
                    ]);
                    setSearch("");
                  }}
                >
                  <span className="truncate">{p.name}</span>
                  <span className="shrink-0 text-xs text-gray-500">
                    {euro.format(p.unitPrice)}/{p.unit} · {p.vatRate}%
                  </span>
                </button>
              </li>
            ))}
            {results.results.length === 0 && <li className="py-2 text-gray-500">Geen artikels gevonden.</li>}
          </ul>
        )}
      </section>

      <section>
        <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Opmerkingsregels op de factuur</p>
        {notes.map((n, i) => (
          <div key={i} className="mt-1.5 flex gap-2">
            <TextInput
              value={n}
              maxLength={1000}
              placeholder="Opmerking…"
              onChange={(e) => setNotes((list) => list.map((x, j) => (j === i ? e.target.value : x)))}
            />
            <button
              type="button"
              aria-label="Opmerkingsregel verwijderen"
              onClick={() => setNotes((list) => list.filter((_, j) => j !== i))}
              className="shrink-0 rounded-md px-2 text-red-500 hover:bg-red-50"
            >
              ✕
            </button>
          </div>
        ))}
        <button type="button" onClick={() => setNotes((list) => [...list, ""])} className="mt-1.5 text-sm text-brand-600">
          + Opmerkingsregel toevoegen
        </button>
      </section>

      <div className="ml-auto max-w-xs">
        <VatTotals summary={vatSummary(itemsFromContent(content))} />
      </div>

      {lines.length === 0 && <ErrorNote message="Een factuur heeft minstens één regel." />}
      <div className="flex justify-end gap-2 border-t border-gray-100 pt-3">
        <Button variant="secondary" onClick={onDone}>
          Annuleren
        </Button>
        <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending || !valid || lines.length === 0}>
          {saveMutation.isPending ? "Bezig…" : "Bewaren"}
        </Button>
      </div>
    </div>
  );
}
