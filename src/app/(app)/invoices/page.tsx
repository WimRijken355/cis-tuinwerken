"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { InvoiceDetailDialog } from "@/components/invoice-detail";
import { FilterBar, FilterField, Pagination, selectClass } from "@/components/pagination";
import { Button, EmptyState, ErrorNote, PageHeader, Spinner, StatusBadge, Toggle } from "@/components/ui";
import { apiGet, apiSend } from "@/lib/api-client";
import {
  EMPTY_INVOICE_FILTER,
  filterInvoices,
  INVOICE_STATUS_OPTIONS,
  isInvoiceFilterActive,
  type InvoiceListFilter,
  type InvoiceStatusFilter,
} from "@/lib/invoice-list";
import { DEFAULT_PAGE_SIZE } from "@/lib/pagination";
import type { InvoiceDto } from "@/lib/schemas/completions";
import { canSendToEf, selectInvoicesToSync } from "@/lib/services/invoice-sync";
import { formatDateShort } from "@/lib/time";

/**
 * Overview of the invoices made by the app and their sync state with
 * EenvoudigFactureren, as a compact table (one line per invoice) with filters:
 * send one invoice, send all not-synced ones, or mark an invoice "niet
 * versturen". Finalising/sending to the customer happens in EF.
 */
const euro = new Intl.NumberFormat("nl-BE", { style: "currency", currency: "EUR" });
const inputClass = "w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm";

interface SyncAllResult {
  total: number;
  sent: number;
  failed: number;
  errors: { invoiceId: number; customerName: string; error: string }[];
}

export default function InvoicesPage() {
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<InvoiceListFilter>(EMPTY_INVOICE_FILTER);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(DEFAULT_PAGE_SIZE);
  /** Invoice open in the detail dialog. */
  const [detailId, setDetailId] = useState<number | null>(null);
  const [syncAllResult, setSyncAllResult] = useState<SyncAllResult | null>(null);

  const { data: invoices, isLoading, error } = useQuery({
    queryKey: ["invoices"],
    queryFn: () => apiGet<InvoiceDto[]>("/api/invoices"),
  });
  const { data: settings } = useQuery({
    queryKey: ["settings"],
    queryFn: () => apiGet<{ efInvoiceSyncEnabled: boolean }>("/api/settings"),
  });
  const syncEnabled = settings?.efInvoiceSyncEnabled ?? true;

  const toSyncCount = selectInvoicesToSync(
    (invoices ?? []).map((i) => ({ ...i, isDemoCustomer: i.customerIsDemo ?? false })),
    syncEnabled,
  ).length;
  const filtered = useMemo(() => filterInvoices(invoices ?? [], filter), [invoices, filter]);
  const visible = filtered.slice((page - 1) * pageSize, page * pageSize);

  const updateFilter = (patch: Partial<InvoiceListFilter>) => {
    setFilter((f) => ({ ...f, ...patch }));
    setPage(1);
  };

  const refresh = () => void queryClient.invalidateQueries({ queryKey: ["invoices"] });
  const sendMutation = useMutation({
    mutationFn: (id: number) => apiSend(`/api/invoices/${id}/retry-push`, "POST"),
    onSettled: refresh,
  });
  const syncAllMutation = useMutation({
    mutationFn: () => apiSend<SyncAllResult>("/api/invoices/sync-all", "POST"),
    onSuccess: setSyncAllResult,
    onSettled: refresh,
  });
  const excludeMutation = useMutation({
    mutationFn: ({ id, excluded }: { id: number; excluded: boolean }) =>
      apiSend(`/api/invoices/${id}/sync-exclusion`, "PUT", { excluded }),
    onSettled: refresh,
  });
  const actionError = sendMutation.error ?? syncAllMutation.error ?? excludeMutation.error;

  return (
    <div className="p-4 md:p-8">
      <PageHeader
        title="Facturen"
        actions={
          <div className="flex flex-wrap gap-2">
            <Button
              onClick={() => {
                setSyncAllResult(null);
                syncAllMutation.mutate();
              }}
              disabled={!syncEnabled || toSyncCount === 0 || syncAllMutation.isPending}
              title={
                !syncEnabled
                  ? "Synchronisatie staat uit (Instellingen → Algemeen)"
                  : toSyncCount === 0
                    ? "Geen niet-gesyncte facturen om te versturen"
                    : undefined
              }
            >
              {syncAllMutation.isPending ? "Bezig met versturen…" : `⇪ Alle niet-gesyncte versturen (${toSyncCount})`}
            </Button>
            <a
              href="https://eenvoudigfactureren.be"
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Open EenvoudigFactureren ↗
            </a>
          </div>
        }
      />

      {settings && !syncEnabled && (
        <p className="mb-4 rounded-md bg-gray-100 px-3 py-2 text-sm text-gray-700">
          Synchronisatie naar EenvoudigFactureren staat uit. Nieuwe facturen blijven enkel in deze app. Aanzetten kan
          via Instellingen → Algemeen.
        </p>
      )}

      {syncAllResult && (
        <div
          className={`mb-4 rounded-md px-3 py-2 text-sm ${
            syncAllResult.failed > 0 ? "bg-amber-50 text-amber-900" : "bg-green-50 text-green-800"
          }`}
        >
          <p>
            {syncAllResult.total === 0
              ? "Er waren geen facturen om te versturen."
              : `${syncAllResult.sent} van ${syncAllResult.total} facturen verstuurd naar EenvoudigFactureren${
                  syncAllResult.failed > 0 ? `, ${syncAllResult.failed} mislukt:` : " ✓"
                }`}
          </p>
          {syncAllResult.errors.length > 0 && (
            <ul className="mt-1 list-inside list-disc text-xs">
              {syncAllResult.errors.map((e) => (
                <li key={e.invoiceId}>
                  {e.customerName}: {e.error}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <FilterBar active={isInvoiceFilterActive(filter)} onReset={() => updateFilter(EMPTY_INVOICE_FILTER)}>
        <FilterField label="Klant / werk" className="w-full sm:w-56">
          <input
            type="search"
            value={filter.text}
            onChange={(e) => updateFilter({ text: e.target.value })}
            placeholder="Zoek op klant, werk, melding"
            className={inputClass}
          />
        </FilterField>
        <FilterField label="Status" className="w-full sm:w-48">
          <select
            value={filter.status}
            onChange={(e) => updateFilter({ status: e.target.value as InvoiceStatusFilter })}
            className={selectClass}
          >
            {INVOICE_STATUS_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </FilterField>
        <FilterField label="Werkdatum van" className="w-[calc(50%-0.25rem)] sm:w-40">
          <input
            type="date"
            value={filter.from}
            onChange={(e) => updateFilter({ from: e.target.value })}
            className={inputClass}
          />
        </FilterField>
        <FilterField label="tot" className="w-[calc(50%-0.25rem)] sm:w-40">
          <input
            type="date"
            value={filter.to}
            onChange={(e) => updateFilter({ to: e.target.value })}
            className={inputClass}
          />
        </FilterField>
      </FilterBar>

      {isLoading && <Spinner />}
      {error && <ErrorNote message={(error as Error).message} />}
      {actionError && (
        <div className="mb-3">
          <ErrorNote message={(actionError as Error).message} />
        </div>
      )}

      {invoices && invoices.length === 0 && (
        <EmptyState>
          Nog geen facturen. Meld een werk klaar via de Dagplanning en de factuur verschijnt hier automatisch.
        </EmptyState>
      )}

      {invoices && invoices.length > 0 && (
        <>
          <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
            <table className="w-full text-sm">
              <thead className="border-b border-gray-200 bg-gray-50 text-left text-xs font-medium uppercase tracking-wide text-gray-500">
                <tr>
                  <th className="px-3 py-2">Klant</th>
                  <th className="px-3 py-2">Werk</th>
                  <th className="px-3 py-2">Datum</th>
                  <th className="px-3 py-2 text-right">Incl. btw</th>
                  <th className="hidden px-3 py-2 text-right lg:table-cell">Excl. btw</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2" title="Niet naar EenvoudigFactureren versturen">
                    Niet versturen
                  </th>
                  <th className="px-3 py-2" />
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {visible.length === 0 && (
                  <tr>
                    <td colSpan={9} className="px-3 py-6 text-center text-gray-500">
                      Geen facturen die aan de filters voldoen.
                    </td>
                  </tr>
                )}
                {visible.map((inv) => {
                  const inEf = inv.efInvoiceId !== null;
                  const check = canSendToEf(
                    { efInvoiceId: inv.efInvoiceId ?? null, pushStatus: inv.pushStatus, syncExcluded: inv.syncExcluded },
                    syncEnabled,
                    inv.customerIsDemo,
                  );
                  const sending = sendMutation.isPending && sendMutation.variables === inv.id;
                  return (
                    <tr key={inv.id} className={`hover:bg-gray-50 ${inv.syncExcluded ? "text-gray-500" : ""}`}>
                      <td className="max-w-[22rem] px-3 py-1.5">
                        <div className="flex items-center gap-2 whitespace-nowrap">
                          <span className="font-medium text-gray-900">{inv.customerName}</span>
                          {inv.errorMessage && (
                            <span className="min-w-0 truncate text-xs text-red-600" title={inv.errorMessage}>
                              ⚠ {inv.errorMessage}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="max-w-[16rem] truncate whitespace-nowrap px-3 py-1.5" title={inv.workTitle}>
                        {inv.workTitle}
                      </td>
                      <td className="whitespace-nowrap px-3 py-1.5 tabular-nums">{formatDateShort(inv.workDate)}</td>
                      <td className="whitespace-nowrap px-3 py-1.5 text-right font-medium tabular-nums">
                        {euro.format(inv.totalInclVat)}
                      </td>
                      <td className="hidden whitespace-nowrap px-3 py-1.5 text-right tabular-nums text-gray-500 lg:table-cell">
                        {euro.format(inv.totalExclVat)}
                      </td>
                      <td className="whitespace-nowrap px-3 py-1.5">
                        <StatusBadge status={inv.pushStatus} />
                      </td>
                      <td className="px-3 py-1.5">
                        {!inEf && (
                          <Toggle
                            checked={inv.syncExcluded}
                            label="Niet versturen"
                            disabled={excludeMutation.isPending}
                            onChange={(excluded) => excludeMutation.mutate({ id: inv.id, excluded })}
                          />
                        )}
                      </td>
                      <td className="whitespace-nowrap px-3 py-1.5 text-right">
                        {!inEf && (
                          <button
                            type="button"
                            onClick={() => sendMutation.mutate(inv.id)}
                            disabled={!check.allowed || sendMutation.isPending}
                            title={check.allowed ? "Naar EenvoudigFactureren sturen" : check.reason}
                            className="rounded-md border border-gray-300 bg-white px-2 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
                          >
                            {sending ? "Bezig…" : inv.pushStatus === "FAILED" ? "↻ Opnieuw" : "→ Naar EF"}
                          </button>
                        )}
                      </td>
                      <td className="px-2 py-1.5 text-right">
                        <button
                          type="button"
                          onClick={() => setDetailId(inv.id)}
                          title="Details bekijken / aanpassen"
                          aria-label="Details"
                          className="rounded-md px-2 py-1 hover:bg-gray-100"
                        >
                          ✏️
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <Pagination
            page={page}
            pageSize={pageSize}
            total={filtered.length}
            onPageChange={setPage}
            onPageSizeChange={(size) => {
              setPageSize(size);
              setPage(1);
            }}
            itemLabel="facturen"
          />
        </>
      )}

      <p className="mt-3 text-xs text-gray-400">
        &quot;Niet versturen&quot; houdt een factuur in de app (ook bij &quot;alle versturen&quot;). Concepten kijk je
        na en finaliseer je in EenvoudigFactureren zelf.
      </p>

      {detailId !== null && <InvoiceDetailDialog invoiceId={detailId} onClose={() => setDetailId(null)} />}
    </div>
  );
}
