"use client";

import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { FilterBar, FilterField, Pagination, selectClass } from "@/components/pagination";
import {
  Button,
  EmptyState,
  ErrorNote,
  Field,
  FieldGroup,
  Modal,
  PageHeader,
  Spinner,
  TextInput,
} from "@/components/ui";
import { ActionButton } from "@/components/action-button";
import { toggleActiveAction } from "@/components/action-icons";
import { apiGet, apiSend } from "@/lib/api-client";
import { DEFAULT_PAGE_SIZE } from "@/lib/pagination";
import {
  RESOURCE_TYPE_LABELS,
  RESOURCE_TYPES,
  type ResourceDto,
  type ResourceListResponse,
  type ResourceType,
  RATE_UNITS,
  RATE_UNIT_LABELS,
  RATE_UNIT_SUFFIX,
  defaultRateUnit,
  type RateUnit,
} from "@/lib/schemas/resources";
import { useDebouncedValue } from "@/lib/use-debounced-value";

const EMPTY_FILTERS = { name: "", type: "", status: "active" };
type Filters = typeof EMPTY_FILTERS;

const euro = new Intl.NumberFormat("nl-BE", { style: "currency", currency: "EUR" });

const TYPE_ICONS: Record<ResourceType, string> = { PERSON: "👷", MACHINE: "🚜" };

/**
 * Resources: the people and machines that are planned (on todos) and
 * invoiced. People are also the picklist of the registration flow.
 */
export default function ResourcesPage() {
  const queryClient = useQueryClient();
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(DEFAULT_PAGE_SIZE);
  // null = closed, "new" = create, otherwise the resource being edited.
  const [editing, setEditing] = useState<ResourceDto | "new" | null>(null);
  const debouncedName = useDebouncedValue(filters.name);

  const params = new URLSearchParams({
    page: String(page),
    pageSize: String(pageSize),
    status: filters.status,
  });
  if (debouncedName) params.set("name", debouncedName);
  if (filters.type) params.set("type", filters.type);

  const { data, isLoading, error } = useQuery({
    queryKey: ["resources", "page", params.toString()],
    queryFn: () => apiGet<ResourceListResponse>(`/api/resources?${params.toString()}`),
    placeholderData: keepPreviousData,
  });

  const toggleMutation = useMutation({
    mutationFn: (r: ResourceDto) => apiSend(`/api/resources/${r.id}`, "PATCH", { active: !r.active }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["resources"] }),
  });

  function setFilter(key: keyof Filters, value: string) {
    setFilters((f) => ({ ...f, [key]: value }));
    setPage(1);
  }

  const filtersActive = JSON.stringify(filters) !== JSON.stringify(EMPTY_FILTERS);
  const items = data?.items ?? [];

  return (
    <div className="p-4 md:p-8">
      <PageHeader
        title="Resources"
        actions={<Button onClick={() => setEditing("new")}>+ Nieuwe resource</Button>}
      />
      <p className="-mt-2 mb-4 max-w-2xl text-sm text-gray-600">
        Personen en machines die je inplant en aanrekent. Het uurtarief van een
        persoon wordt bij elke registratie vastgeklikt, dus oude facturen
        veranderen nooit mee.
      </p>

      <FilterBar
        active={filtersActive}
        onReset={() => {
          setFilters(EMPTY_FILTERS);
          setPage(1);
        }}
      >
        <FilterField label="Naam" className="min-w-48 flex-1">
          <TextInput
            placeholder="Zoek resource…"
            value={filters.name}
            onChange={(e) => setFilter("name", e.target.value)}
          />
        </FilterField>
        <FilterField label="Type" className="w-36">
          <select value={filters.type} onChange={(e) => setFilter("type", e.target.value)} className={selectClass}>
            <option value="">Alle</option>
            {RESOURCE_TYPES.map((t) => (
              <option key={t} value={t}>
                {RESOURCE_TYPE_LABELS[t]}
              </option>
            ))}
          </select>
        </FilterField>
        <FilterField label="Status" className="w-32">
          <select value={filters.status} onChange={(e) => setFilter("status", e.target.value)} className={selectClass}>
            <option value="active">Actief</option>
            <option value="inactive">Inactief</option>
            <option value="all">Alle</option>
          </select>
        </FilterField>
      </FilterBar>

      {isLoading && <Spinner />}
      {error && <ErrorNote message={(error as Error).message} />}
      {toggleMutation.error && <ErrorNote message={(toggleMutation.error as Error).message} />}

      {data && items.length === 0 && (
        <EmptyState>
          {filtersActive
            ? "Geen resources gevonden voor deze filters."
            : "Nog geen resources. Voeg je medewerkers en machines toe."}
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
                  <th className="px-4 py-2">Type</th>
                  <th className="px-4 py-2 text-right">Uurtarief excl. btw</th>
                  <th className="px-4 py-2">Status</th>
                  <th className="px-4 py-2" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {items.map((r) => (
                  <tr key={r.id} className={r.active ? "hover:bg-gray-50" : "text-gray-400"}>
                    <td className="px-4 py-2 font-medium">{r.name}</td>
                    <td className="px-4 py-2">
                      <TypeBadge type={r.type} />
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums">
                      {euro.format(r.hourlyRate)}
                      {RATE_UNIT_SUFFIX[r.rateUnit]}
                    </td>
                    <td className="px-4 py-2">
                      <ActiveBadge active={r.active} />
                    </td>
                    <td className="whitespace-nowrap px-4 py-2 text-right">
                      <RowActions resource={r} onEdit={() => setEditing(r)} onToggle={() => toggleMutation.mutate(r)} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile: cards */}
          <ul className="divide-y divide-gray-100 overflow-hidden rounded-lg border border-gray-200 bg-white md:hidden">
            {items.map((r) => (
              <li key={r.id} className="flex items-start justify-between gap-3 px-4 py-3 text-sm">
                <div className={`min-w-0 ${r.active ? "" : "text-gray-400"}`}>
                  <p className="font-medium">
                    {TYPE_ICONS[r.type]} {r.name}
                  </p>
                  <p className="text-gray-500">
                    {RESOURCE_TYPE_LABELS[r.type]} · {euro.format(r.hourlyRate)}
                    {RATE_UNIT_SUFFIX[r.rateUnit]}
                  </p>
                  {!r.active && <ActiveBadge active={false} />}
                </div>
                <RowActions resource={r} onEdit={() => setEditing(r)} onToggle={() => toggleMutation.mutate(r)} />
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
          itemLabel="resources"
          onPageChange={setPage}
          onPageSizeChange={(size) => {
            setPageSize(size);
            setPage(1);
          }}
        />
      )}

      <Modal
        title={editing === "new" ? "Nieuwe resource" : "Resource bewerken"}
        open={editing !== null}
        onClose={() => setEditing(null)}
      >
        {editing !== null && (
          <ResourceForm
            key={editing === "new" ? "new" : editing.id}
            resource={editing === "new" ? null : editing}
            onDone={() => setEditing(null)}
          />
        )}
      </Modal>
    </div>
  );
}

function TypeBadge({ type }: { type: ResourceType }) {
  const cls = type === "PERSON" ? "bg-blue-50 text-blue-800" : "bg-amber-50 text-amber-800";
  return (
    <span className={`whitespace-nowrap rounded-full px-2 py-0.5 text-xs ${cls}`}>
      {TYPE_ICONS[type]} {RESOURCE_TYPE_LABELS[type]}
    </span>
  );
}

function ActiveBadge({ active }: { active: boolean }) {
  return active ? (
    <span className="rounded-full bg-brand-50 px-2 py-0.5 text-xs text-brand-700">Actief</span>
  ) : (
    <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-500">Inactief</span>
  );
}

function RowActions({
  resource,
  onEdit,
  onToggle,
}: {
  resource: ResourceDto;
  onEdit: () => void;
  onToggle: () => void;
}) {
  return (
    <div className="flex shrink-0 flex-wrap justify-end gap-1">
      <ActionButton action="edit" onClick={onEdit} />
      <ActionButton action={toggleActiveAction(resource.active)} onClick={onToggle} />
    </div>
  );
}

/** Create (resource = null) or edit a resource. */
function ResourceForm({ resource, onDone }: { resource: ResourceDto | null; onDone: () => void }) {
  const queryClient = useQueryClient();
  const [name, setName] = useState(resource?.name ?? "");
  const [type, setType] = useState<ResourceType>(resource?.type ?? "PERSON");
  const [rate, setRate] = useState(resource ? String(resource.hourlyRate) : "");
  const [rateUnit, setRateUnit] = useState<RateUnit>(resource?.rateUnit ?? defaultRateUnit(resource?.type ?? "PERSON"));
  const pickType = (t: ResourceType) => {
    // A new resource follows the type's usual unit (machines: per day).
    if (!resource) setRateUnit(defaultRateUnit(t));
    setType(t);
  };

  const saveMutation = useMutation({
    mutationFn: () => {
      const body = { name, type, hourlyRate: Number(rate.replace(",", ".")), rateUnit };
      return resource
        ? apiSend(`/api/resources/${resource.id}`, "PATCH", body)
        : apiSend("/api/resources", "POST", body);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["resources"] });
      onDone();
    },
  });

  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        saveMutation.mutate();
      }}
    >
      {saveMutation.error && <ErrorNote message={(saveMutation.error as Error).message} />}
      <FieldGroup label="Type">
        <div className="flex gap-2">
          {RESOURCE_TYPES.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => pickType(t)}
              className={`flex-1 rounded-md border px-3 py-2 text-sm ${
                type === t
                  ? "border-brand-600 bg-brand-50 font-medium text-brand-700"
                  : "border-gray-300 bg-white text-gray-600 hover:bg-gray-50"
              }`}
            >
              {TYPE_ICONS[t]} {RESOURCE_TYPE_LABELS[t]}
            </button>
          ))}
        </div>
      </FieldGroup>
      <Field label="Naam">
        <TextInput
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={type === "PERSON" ? "bv. Jan" : "bv. Minigraver"}
          required
          autoFocus
        />
      </Field>
      <div className="flex flex-wrap items-start gap-3">
        <div className="w-40">
          <Field label={rateUnit === "DAY" ? "Dagtarief (€)" : "Uurtarief (€)"} hint="Excl. btw">
            <TextInput inputMode="decimal" value={rate} onChange={(e) => setRate(e.target.value)} required />
          </Field>
        </div>
        <FieldGroup label="Tarief">
          <div className="flex gap-1" role="radiogroup" aria-label="Tariefeenheid">
            {RATE_UNITS.map((u) => (
              <button
                key={u}
                type="button"
                role="radio"
                aria-checked={rateUnit === u}
                onClick={() => setRateUnit(u)}
                className={`min-h-10 rounded-md border px-3 text-sm ${
                  rateUnit === u
                    ? "border-brand-600 bg-brand-50 font-medium text-brand-700"
                    : "border-gray-300 bg-white text-gray-600 hover:bg-gray-50"
                }`}
              >
                {RATE_UNIT_LABELS[u]}
              </button>
            ))}
          </div>
        </FieldGroup>
      </div>
      {rateUnit === "DAY" && (
        <p className="text-xs text-gray-500">
          Bij het klaarmelden geef je voor deze resource het aantal dagen in (per halve dag); de gewerkte uren blijven
          voor het overzicht.
        </p>
      )}
      {resource && resource.rateUnit !== rateUnit && (
        <p className="text-xs text-amber-700">
          Pas ook het bedrag aan. Al geregistreerd werk behoudt zijn tarief van toen.
        </p>
      )}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onDone}>
          Annuleren
        </Button>
        <Button type="submit" disabled={saveMutation.isPending}>
          {saveMutation.isPending ? "Bezig…" : resource ? "Bewaren" : "Toevoegen"}
        </Button>
      </div>
    </form>
  );
}
