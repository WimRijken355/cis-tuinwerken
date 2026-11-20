"use client";

import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { FilterBar, FilterField, Pagination, selectClass } from "@/components/pagination";
import {
  Button,
  EmptyState,
  ErrorNote,
  Field,
  Modal,
  PageHeader,
  Spinner,
  TextInput,
} from "@/components/ui";
import { ActionButton } from "@/components/action-button";
import { toggleActiveAction } from "@/components/action-icons";
import { apiGet, apiSend } from "@/lib/api-client";
import { DEFAULT_PAGE_SIZE } from "@/lib/pagination";
import type { PriceListItemListDto, PriceListResponse } from "@/lib/schemas/catalog";
import { useDebouncedValue } from "@/lib/use-debounced-value";

interface ImportReport {
  totalInEf: number;
  created: number;
  linked: number;
  skipped: number;
}

interface SettingsFlags {
  efConfigured: boolean;
}

const EMPTY_FILTERS = { name: "", vatRate: "", status: "active", source: "all" };
type Filters = typeof EMPTY_FILTERS;

const euro = new Intl.NumberFormat("nl-BE", { style: "currency", currency: "EUR" });

/**
 * Products ("Artikels"): the price list of extras that can be charged on a
 * registration next to hours. Backed by /api/price-list (paginated mode).
 */
export default function ProductsPage() {
  const [showNew, setShowNew] = useState(false);
  const { data: settings } = useQuery({
    queryKey: ["settings"],
    queryFn: () => apiGet<SettingsFlags>("/api/settings"),
  });

  return (
    <div className="p-4 md:p-8">
      <PageHeader
        title="Artikels"
        actions={<Button onClick={() => setShowNew(true)}>+ Nieuw artikel</Button>}
      />
      <div className="space-y-6">
        <ProductTable />
        <EfProductImportSection efConfigured={settings?.efConfigured ?? false} />
      </div>
      <Modal title="Nieuw artikel" open={showNew} onClose={() => setShowNew(false)}>
        <NewProductForm onDone={() => setShowNew(false)} />
      </Modal>
    </div>
  );
}

function ProductTable() {
  const queryClient = useQueryClient();
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(DEFAULT_PAGE_SIZE);
  const debouncedName = useDebouncedValue(filters.name);

  const params = new URLSearchParams({
    page: String(page),
    pageSize: String(pageSize),
    status: filters.status,
    source: filters.source,
  });
  if (debouncedName) params.set("name", debouncedName);
  if (filters.vatRate) params.set("vatRate", filters.vatRate);

  const { data, isLoading, error } = useQuery({
    queryKey: ["price-list", "page", params.toString()],
    queryFn: () => apiGet<PriceListResponse>(`/api/price-list?${params.toString()}`),
    placeholderData: keepPreviousData,
  });

  const toggleMutation = useMutation({
    mutationFn: (item: PriceListItemListDto) =>
      apiSend(`/api/price-list/${item.id}`, "PATCH", { active: !item.active }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["price-list"] }),
  });

  function setFilter<K extends keyof Filters>(key: K, value: Filters[K]) {
    setFilters((f) => ({ ...f, [key]: value }));
    setPage(1);
  }

  const filtersActive = JSON.stringify(filters) !== JSON.stringify(EMPTY_FILTERS);
  const items = data?.items ?? [];

  return (
    <section>
      <FilterBar
        active={filtersActive}
        onReset={() => {
          setFilters(EMPTY_FILTERS);
          setPage(1);
        }}
      >
        <FilterField label="Naam" className="min-w-48 flex-1">
          <TextInput
            placeholder="Zoek artikel…"
            value={filters.name}
            onChange={(e) => setFilter("name", e.target.value)}
          />
        </FilterField>
        <FilterField label="Btw" className="w-28">
          <select
            value={filters.vatRate}
            onChange={(e) => setFilter("vatRate", e.target.value)}
            className={selectClass}
          >
            <option value="">Alle</option>
            <option value="21">21%</option>
            <option value="12">12%</option>
            <option value="6">6%</option>
            <option value="0">0%</option>
          </select>
        </FilterField>
        <FilterField label="Status" className="w-32">
          <select
            value={filters.status}
            onChange={(e) => setFilter("status", e.target.value)}
            className={selectClass}
          >
            <option value="active">Actief</option>
            <option value="inactive">Inactief</option>
            <option value="all">Alle</option>
          </select>
        </FilterField>
        <FilterField label="Bron" className="w-36">
          <select
            value={filters.source}
            onChange={(e) => setFilter("source", e.target.value)}
            className={selectClass}
          >
            <option value="all">Alle</option>
            <option value="ef">EenvoudigFactureren</option>
            <option value="manual">Manueel</option>
          </select>
        </FilterField>
      </FilterBar>

      {isLoading && <Spinner />}
      {error && <ErrorNote message={(error as Error).message} />}
      {toggleMutation.error && <ErrorNote message={(toggleMutation.error as Error).message} />}

      {data && items.length === 0 && (
        <EmptyState>
          {filtersActive
            ? "Geen artikels gevonden voor deze filters."
            : "Nog geen artikels. Voeg er een toe of importeer ze uit EenvoudigFactureren."}
        </EmptyState>
      )}

      {items.length > 0 && (
        <>
          {/* Desktop: table */}
          <div className="hidden overflow-x-auto rounded-lg border border-gray-200 bg-white md:block">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-left text-xs font-medium uppercase tracking-wide text-gray-500">
                <tr>
                  <th className="px-4 py-2">Naam</th>
                  <th className="px-4 py-2">Eenheid</th>
                  <th className="px-4 py-2 text-right">Prijs excl. btw</th>
                  <th className="px-4 py-2 text-right">Btw</th>
                  <th className="px-4 py-2">Bron</th>
                  <th className="px-4 py-2">Status</th>
                  <th className="px-4 py-2" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {items.map((item) => (
                  <tr key={item.id} className={item.active ? "hover:bg-gray-50" : "text-gray-400"}>
                    <td className="px-4 py-2 font-medium">{item.name}</td>
                    <td className="px-4 py-2">{item.unit}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{euro.format(item.unitPrice)}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{item.vatRate}%</td>
                    <td className="px-4 py-2">
                      <SourceBadge efLinked={item.efStockItemId !== null} />
                    </td>
                    <td className="px-4 py-2">
                      <ActiveBadge active={item.active} />
                    </td>
                    <td className="px-4 py-2 text-right">
                      <ToggleButton item={item} onToggle={() => toggleMutation.mutate(item)} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile: cards */}
          <ul className="divide-y divide-gray-100 overflow-hidden rounded-lg border border-gray-200 bg-white md:hidden">
            {items.map((item) => (
              <li key={item.id} className="flex items-start justify-between gap-3 px-4 py-3 text-sm">
                <div className={`min-w-0 ${item.active ? "" : "text-gray-400"}`}>
                  <p className="font-medium">{item.name}</p>
                  <p className="text-gray-500">
                    {euro.format(item.unitPrice)} / {item.unit} · {item.vatRate}% btw
                  </p>
                  <div className="mt-1 flex gap-1">
                    <SourceBadge efLinked={item.efStockItemId !== null} />
                    {!item.active && <ActiveBadge active={false} />}
                  </div>
                </div>
                <ToggleButton item={item} onToggle={() => toggleMutation.mutate(item)} />
              </li>
            ))}
          </ul>
        </>
      )}

      {data && (
        <Pagination
          page={data.page}
          pageSize={data.pageSize}
          total={data.total}
          itemLabel="artikels"
          onPageChange={setPage}
          onPageSizeChange={(size) => {
            setPageSize(size);
            setPage(1);
          }}
        />
      )}
    </section>
  );
}

function SourceBadge({ efLinked }: { efLinked: boolean }) {
  return efLinked ? (
    <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs text-green-800" title="Geïmporteerd uit EenvoudigFactureren">
      EF
    </span>
  ) : (
    <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600">Manueel</span>
  );
}

function ActiveBadge({ active }: { active: boolean }) {
  return active ? (
    <span className="rounded-full bg-brand-50 px-2 py-0.5 text-xs text-brand-700">Actief</span>
  ) : (
    <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-500">Inactief</span>
  );
}

function ToggleButton({ item, onToggle }: { item: PriceListItemListDto; onToggle: () => void }) {
  return (
    <ActionButton action={toggleActiveAction(item.active)} onClick={onToggle} />
  );
}

function NewProductForm({ onDone }: { onDone: () => void }) {
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [unit, setUnit] = useState("stuk");
  const [price, setPrice] = useState("");
  const [vat, setVat] = useState("21");

  const addMutation = useMutation({
    mutationFn: () =>
      apiSend("/api/price-list", "POST", {
        name,
        unit,
        unitPrice: Number(price.replace(",", ".")),
        vatRate: Number(vat),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["price-list"] });
      onDone();
    },
  });

  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        addMutation.mutate();
      }}
    >
      {addMutation.error && <ErrorNote message={(addMutation.error as Error).message} />}
      <Field label="Naam">
        <TextInput value={name} onChange={(e) => setName(e.target.value)} required autoFocus />
      </Field>
      <div className="grid grid-cols-3 gap-3">
        <Field label="Eenheid" hint="Max 10 tekens (EF-limiet)">
          <TextInput value={unit} onChange={(e) => setUnit(e.target.value)} maxLength={10} required />
        </Field>
        <Field label="Prijs (€)" hint="Excl. btw">
          <TextInput inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} required />
        </Field>
        <Field label="Btw">
          <select value={vat} onChange={(e) => setVat(e.target.value)} className={selectClass}>
            <option value="21">21%</option>
            <option value="12">12%</option>
            <option value="6">6%</option>
            <option value="0">0%</option>
          </select>
        </Field>
      </div>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onDone}>
          Annuleren
        </Button>
        <Button type="submit" disabled={addMutation.isPending}>
          {addMutation.isPending ? "Bezig…" : "Toevoegen"}
        </Button>
      </div>
    </form>
  );
}

/** Import of stock items ("artikels") from EenvoudigFactureren. */
function EfProductImportSection({ efConfigured }: { efConfigured: boolean }) {
  const queryClient = useQueryClient();
  const [report, setReport] = useState<ImportReport | null>(null);

  const importMutation = useMutation({
    mutationFn: () => apiSend<ImportReport>("/api/price-list/import-ef", "POST"),
    onSuccess: (data) => {
      setReport(data);
      void queryClient.invalidateQueries({ queryKey: ["price-list"] });
    },
  });

  return (
    <section className="max-w-2xl rounded-lg border border-gray-200 bg-white p-4">
      <h2 className="font-semibold">EenvoudigFactureren — artikels importeren</h2>
      <p className="mt-1 text-sm text-gray-600">
        Haalt je artikels op uit EenvoudigFactureren en zet ze in deze lijst.
        Veilig om meermaals te draaien: er worden nooit duplicaten aangemaakt en
        bestaande artikels met dezelfde naam worden enkel gekoppeld, niet
        overschreven. Controleer na de import de btw-percentages.
      </p>
      {!efConfigured && (
        <p className="mt-2 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">
          ⚠ Nog geen API-key geconfigureerd (EF_API_KEY in .env). Zie
          docs/integratie-eenvoudigfactureren.md.
        </p>
      )}
      <div className="mt-3">
        <Button
          onClick={() => importMutation.mutate()}
          disabled={importMutation.isPending || !efConfigured}
        >
          {importMutation.isPending ? "Bezig met importeren…" : "Importeer artikels uit EF"}
        </Button>
      </div>
      {importMutation.error && (
        <div className="mt-3">
          <ErrorNote message={(importMutation.error as Error).message} />
        </div>
      )}
      {report && (
        <div className="mt-3 rounded-md bg-brand-50 p-3 text-sm text-brand-900">
          <p className="font-medium">Import klaar ✔</p>
          <ul className="mt-1 list-inside list-disc">
            <li>{report.totalInEf} artikels gevonden in EenvoudigFactureren</li>
            <li>{report.created} nieuw aangemaakt</li>
            <li>{report.linked} gekoppeld aan bestaande artikels</li>
            <li>{report.skipped} overgeslagen (al gekoppeld)</li>
          </ul>
        </div>
      )}
    </section>
  );
}
