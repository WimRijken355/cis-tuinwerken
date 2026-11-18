"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { InvoiceDetailDialog } from "@/components/invoice-detail";
import { FilterBar, FilterField, Pagination, selectClass } from "@/components/pagination";
import { Button, EmptyState, ErrorNote, PageHeader, Spinner, StatusBadge, Toggle } from "@/components/ui";
import { apiGet, apiSend } from "@/lib/api-client";
import {
  effectiveSelection,
  EMPTY_INVOICE_FILTER,
  filterInvoices,
  INVOICE_STATUS_OPTIONS,
  isInvoiceFilterActive,
  type InvoiceListFilter,
  type InvoiceStatusFilter,
  selectAllState,
  toggleSelectAll,
  toggleSelected,
} from "@/lib/invoice-list";
import { DEFAULT_PAGE_SIZE } from "@/lib/pagination";
import type { InvoiceDto } from "@/lib/schemas/completions";
import { canSendToEf } from "@/lib/services/invoice-sync";
import { formatDateShort } from "@/lib/time";

/**
 * Overview of the invoices made by the app and their sync state with
 * EenvoudigFactureren, as a compact table (one line per invoice) with filters:
 * send one invoice, select several (e.g. filter "Niet gesynchroniseerd" +
 * select all) and send the selection, or mark an invoice "niet versturen".
 * Finalising/sending to the customer happens in EF.
 */
const euro = new Intl.NumberFormat("nl-BE", { style: "currency", currency: "EUR" });
const inputClass = "w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm";

interface SyncResult {
  total: number;
  sent: number;
  failed: number;
  skipped: number;
  errors: { invoiceId: number; customerName: string; error: string }[];
}

export default function InvoicesPage() {
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<InvoiceListFilter>(EMPTY_INVOICE_FILTER);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(DEFAULT_PAGE_SIZE);
  /** Invoice open in the detail dialog. */
  const [detailId, setDetailId] = useState<number | null>(null);
  const [syncResult, setSyncResult] = useState<SyncResult | null>(null);
  /** Invoices ticked for "Geselecteerde naar EF sturen". */
  const [selected, setSelected] = useState<Set<number>>(new Set());

  const { data: invoices, isLoading, error } = useQuery({
    queryKey: ["invoices"],
    queryFn: () => apiGet<InvoiceDto[]>("/api/invoices"),
  });
  const { data: settings } = useQuery({
    queryKey: ["settings"],
    queryFn: () => apiGet<{ efInvoiceSyncEnabled: boolean }>("/api/settings"),
  });
  const syncEnabled = settings?.efInvoiceSyncEnabled ?? true;

  const filtered = useMemo(() => filterInvoices(invoices ?? [], filter), [invoices, filter]);
  const visible = filtered.slice((page - 1) * pageSize, page * pageSize);
  const sendCheck = (inv: InvoiceDto) =>
    canSendToEf(
      { efInvoiceId: inv.efInvoiceId ?? null, pushStatus: inv.pushStatus, syncExcluded: inv.syncExcluded },
      syncEnabled,
      inv.customerIsDemo,
    );
  // Selectable = sendable invoices in the filtered list (all pages, not only the visible one).
  const selectableIds = filtered.filter((i) => sendCheck(i).allowed).map((i) => i.id);
  const selection = effectiveSelection(selectableIds, selected);
  const allState = selectAllState(selectableIds, selected);

  const updateFilter = (patch: Partial<InvoiceListFilter>) => {
    setFilter((f) => ({ ...f, ...patch }));
    setPage(1);
  };

  const refresh = () => void queryClient.invalidateQueries({ queryKey: ["invoices"] });
  const sendMutation = useMutation({
    mutationFn: (id: number) => apiSend(`/api/invoices/${id}/retry-push`, "POST"),
    onSettled: refresh,
  });
  const syncSelectedMutation = useMutation({
    mutationFn: (ids: number[]) => apiSend<SyncResult>("/api/invoices/sync-selected", "POST", { ids }),
    onSuccess: (result) => {
      setSyncResult(result);
      setSelected(new Set());
    },
    onSettled: refresh,
  });
  const excludeMutation = useMutation({
    mutationFn: ({ id, excluded }: { id: number; excluded: boolean }) =>
      apiSend(`/api/invoices/${id}/sync-exclusion`, "PUT", { excluded }),
    onSettled: refresh,
  });
  const actionError = sendMutation.error ?? syncSelectedMutation.error ?? excludeMutation.error;

  return (
    <div className="p-4 md:p-8">
      <PageHeader
        title="Facturen"
        actions={
          <a
            href="https://eenvoudigfactureren.be"
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Open EenvoudigFactureren ↗
          </a>
        }
      />

      {settings && !syncEnabled && (
        <p className="mb-4 rounded-md bg-gray-100 px-3 py-2 text-sm text-gray-700">
          Synchronisatie naar EenvoudigFactureren staat uit. Nieuwe facturen blijven enkel in deze app. Aanzetten kan
          via Instellingen → Algemeen.
        </p>
      )}

      {syncResult && (
        <div
          className={`mb-4 rounded-md px-3 py-2 text-sm ${
            syncResult.failed > 0 ? "bg-amber-50 text-amber-900" : "bg-green-50 text-green-800"
          }`}
        >
          <p>
            {syncResult.total === 0
              ? "Geen enkele geselecteerde factuur kon verstuurd worden."
              : `${syncResult.sent} van ${syncResult.total} facturen verstuurd naar EenvoudigFactureren${
                  syncResult.failed > 0 ? `, ${syncResult.failed} mislukt` : " ✓"
                }`}
            {syncResult.skipped > 0 &&
              ` (${syncResult.skipped} overgeslagen: al in EF, "niet versturen" of demoklant)`}
          </p>
          {syncResult.errors.length > 0 && (
            <ul className="mt-1 list-inside list-disc text-xs">
              {syncResult.errors.map((e) => (
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
          <div className="mb-2 flex flex-wrap items-center gap-3 text-sm">
            <Button
              onClick={() => {
                setSyncResult(null);
                syncSelectedMutation.mutate(selection);
              }}
              disabled={selection.length === 0 || syncSelectedMutation.isPending}
            >
              {syncSelectedMutation.isPending
                ? "Bezig met versturen…"
                : `→ Geselecteerde naar EF sturen (${selection.length})`}
            </Button>
            {selection.length > 0 && (
              <button type="button" onClick={() => setSelected(new Set())} className="text-brand-600 hover:underline">
                Selectie wissen
              </button>
            )}
            <span className="text-xs text-gray-500">
              {!syncEnabled
                ? "Synchronisatie staat uit — eerst aanzetten via Instellingen → Algemeen."
                : selectableIds.length === 0
                  ? "Geen verstuurbare facturen in deze lijst."
                  : `Tip: filter op "Niet gesynchroniseerd" en vink bovenaan alles aan (${selectableIds.length} verstuurbaar).`}
            </span>
          </div>

          <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
            <table className="w-full text-sm">
              <thead className="border-b border-gray-200 bg-gray-50 text-left text-xs font-medium uppercase tracking-wide text-gray-500">
                <tr>
                  <th className="w-8 px-3 py-2">
                    <SelectAllCheckbox
                      state={allState}
                      disabled={selectableIds.length === 0}
                      onToggle={() => setSelected((s) => toggleSelectAll(selectableIds, s))}
                    />
                  </th>
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
                    <td colSpan={10} className="px-3 py-6 text-center text-gray-500">
                      Geen facturen die aan de filters voldoen.
                    </td>
                  </tr>
                )}
                {visible.map((inv) => {
                  const inEf = inv.efInvoiceId !== null;
                  const check = sendCheck(inv);
                  const isSelected = check.allowed && selected.has(inv.id);
                  const sending = sendMutation.isPending && sendMutation.variables === inv.id;
                  return (
                    <tr
                      key={inv.id}
                      className={`${isSelected ? "bg-brand-50" : "hover:bg-gray-50"} ${
                        inv.syncExcluded ? "text-gray-500" : ""
                      }`}
                    >
                      <td className="px-3 py-1.5">
                        <input
                          type="checkbox"
                          className="h-4 w-4 align-middle"
                          checked={isSelected}
                          disabled={!check.allowed}
                          title={check.allowed ? "Selecteren om te versturen" : check.reason}
                          aria-label={`Factuur ${inv.customerName} selecteren`}
                          onChange={() => setSelected((s) => toggleSelected(s, inv.id))}
                        />
                      </td>
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
        &quot;Niet versturen&quot; houdt een factuur in de app (ze is dan ook niet selecteerbaar). Concepten kijk je na
        en finaliseer je in EenvoudigFactureren zelf.
      </p>

      {detailId !== null && <InvoiceDetailDialog invoiceId={detailId} onClose={() => setDetailId(null)} />}
    </div>
  );
}

/** Header checkbox: checked when all selectable invoices are selected, indeterminate when some are. */
function SelectAllCheckbox({
  state,
  disabled,
  onToggle,
}: {
  state: "none" | "some" | "all";
  disabled: boolean;
  onToggle: () => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = state === "some";
  }, [state]);
  return (
    <input
      ref={ref}
      type="checkbox"
      className="h-4 w-4 align-middle"
      checked={state === "all"}
      disabled={disabled}
      onChange={onToggle}
      title="Alle verstuurbare facturen in deze (gefilterde) lijst selecteren"
      aria-label="Alles selecteren"
    />
  );
}
