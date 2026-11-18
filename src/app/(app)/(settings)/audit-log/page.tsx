"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { FilterBar, FilterField, Pagination, selectClass } from "@/components/pagination";
import { EmptyState, ErrorNote, Modal, PageHeader, Spinner, TextInput } from "@/components/ui";
import { apiGet } from "@/lib/api-client";
import {
  changedFields,
  type AuditLogDto,
  type AuditLogListResponse,
} from "@/lib/schemas/audit-log";
import type { UserDto } from "@/lib/schemas/users";
import { formatDateShort, formatTime } from "@/lib/time";
import { useDebouncedValue } from "@/lib/use-debounced-value";

/**
 * Audit trail overview: every create/update/delete on a business table
 * (see AUDITED_MODELS in src/lib/audit.ts), who made it and the full row
 * before/after.
 */

const TABLE_LABELS: Record<string, string> = {
  Customer: "Klant",
  Todo: "Taak",
  RecurringTemplate: "Terugkerend werk",
  RecurringWindow: "Herhalingsvenster",
  Appointment: "Afspraak",
  Completion: "Registratie",
  LaborEntry: "Uren",
  Resource: "Resource",
  TodoResource: "Todo-resource",
  TodoTask: "Todo-taak",
  ChecklistItem: "Checklist-taak",
  LooseTodoPreset: "Type losse todo",
  RecurringTemplateTask: "Taak terugkerend werk",
  RecurringTemplateResource: "Resource terugkerend werk",
  PriceListItem: "Artikel",
  ExtraCharge: "Extra",
  Invoice: "Factuur",
  Setting: "Instelling",
};

const ACTION_LABELS: Record<string, { label: string; cls: string }> = {
  CREATE: { label: "Aangemaakt", cls: "bg-green-100 text-green-800" },
  UPDATE: { label: "Gewijzigd", cls: "bg-blue-100 text-blue-800" },
  DELETE: { label: "Verwijderd", cls: "bg-red-100 text-red-800" },
};

const EMPTY_FILTERS = { table: "", action: "", user: "", recordId: "", from: "", to: "" };
type Filters = typeof EMPTY_FILTERS;

/** Tables that no longer exist but still appear in older audit rows (display only, not filterable). */
const LEGACY_TABLE_LABELS: Record<string, string> = {
  Worker: "Medewerker (oud)",
};

const tableLabel = (name: string) => TABLE_LABELS[name] ?? LEGACY_TABLE_LABELS[name] ?? name;

export default function AuditLogPage() {
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [detail, setDetail] = useState<AuditLogDto | null>(null);
  const debouncedRecordId = useDebouncedValue(filters.recordId);

  const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
  for (const [key, value] of Object.entries({ ...filters, recordId: debouncedRecordId })) {
    if (value.trim()) params.set(key, value.trim());
  }

  const { data, isLoading, error } = useQuery({
    queryKey: ["audit-log", params.toString()],
    queryFn: () => apiGet<AuditLogListResponse>(`/api/audit-log?${params.toString()}`),
    placeholderData: keepPreviousData,
  });

  const { data: users } = useQuery({
    queryKey: ["users"],
    queryFn: () => apiGet<UserDto[]>("/api/users"),
  });

  function setFilter(key: keyof Filters, value: string) {
    setFilters((f) => ({ ...f, [key]: value }));
    setPage(1);
  }

  const filtersActive = Object.values(filters).some((v) => v !== "");
  const rows = data?.items ?? [];

  return (
    <div className="p-4 md:p-8">
      <PageHeader title="Audittrail" />

      <FilterBar
        active={filtersActive}
        onReset={() => {
          setFilters(EMPTY_FILTERS);
          setPage(1);
        }}
      >
        <FilterField label="Tabel" className="w-44">
          <select value={filters.table} onChange={(e) => setFilter("table", e.target.value)} className={selectClass}>
            <option value="">Alle tabellen</option>
            {Object.entries(TABLE_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </FilterField>
        <FilterField label="Actie" className="w-36">
          <select value={filters.action} onChange={(e) => setFilter("action", e.target.value)} className={selectClass}>
            <option value="">Alle acties</option>
            {Object.entries(ACTION_LABELS).map(([value, { label }]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </FilterField>
        <FilterField label="Gebruiker" className="w-40">
          <select value={filters.user} onChange={(e) => setFilter("user", e.target.value)} className={selectClass}>
            <option value="">Iedereen</option>
            {users?.map((u) => (
              <option key={u.id} value={u.id}>
                {u.username}
              </option>
            ))}
            <option value="system">Systeem (achtergrondjob)</option>
          </select>
        </FilterField>
        <FilterField label="Record-id" className="w-28">
          <TextInput
            inputMode="numeric"
            placeholder="bv. 42"
            value={filters.recordId}
            onChange={(e) => setFilter("recordId", e.target.value)}
          />
        </FilterField>
        <FilterField label="Van" className="w-40">
          <TextInput type="date" value={filters.from} onChange={(e) => setFilter("from", e.target.value)} />
        </FilterField>
        <FilterField label="Tot en met" className="w-40">
          <TextInput type="date" value={filters.to} onChange={(e) => setFilter("to", e.target.value)} />
        </FilterField>
      </FilterBar>

      {isLoading && <Spinner />}
      {error && <ErrorNote message={(error as Error).message} />}

      {data && rows.length === 0 && (
        <EmptyState>
          {filtersActive ? "Geen wijzigingen gevonden voor deze filters." : "Nog geen wijzigingen gelogd."}
        </EmptyState>
      )}

      {rows.length > 0 && (
        <>
          {/* Desktop: table */}
          <div className="hidden overflow-x-auto rounded-lg border border-gray-200 bg-white md:block">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-left text-xs font-medium uppercase tracking-wide text-gray-500">
                <tr>
                  <th className="px-4 py-2">Tijdstip</th>
                  <th className="px-4 py-2">Tabel</th>
                  <th className="px-4 py-2">Record</th>
                  <th className="px-4 py-2">Actie</th>
                  <th className="px-4 py-2">Gebruiker</th>
                  <th className="px-4 py-2">Gewijzigde velden</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {rows.map((row) => (
                  <tr key={row.id} className="cursor-pointer hover:bg-gray-50" onClick={() => setDetail(row)}>
                    <td className="whitespace-nowrap px-4 py-2 tabular-nums text-gray-600">
                      {formatDateShort(row.createdAt)} {formatTime(row.createdAt)}
                    </td>
                    <td className="px-4 py-2 font-medium">{tableLabel(row.tableName)}</td>
                    <td className="px-4 py-2 tabular-nums text-gray-600">#{row.recordId}</td>
                    <td className="px-4 py-2">
                      <ActionBadge action={row.action} />
                    </td>
                    <td className="px-4 py-2">{row.username ?? <span className="text-gray-400">Systeem</span>}</td>
                    <td className="max-w-72 truncate px-4 py-2 text-gray-500">
                      <ChangeSummary row={row} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile: cards */}
          <ul className="divide-y divide-gray-100 overflow-hidden rounded-lg border border-gray-200 bg-white md:hidden">
            {rows.map((row) => (
              <li key={row.id}>
                <button
                  type="button"
                  onClick={() => setDetail(row)}
                  className="flex w-full items-start justify-between gap-3 px-4 py-3 text-left text-sm hover:bg-gray-50"
                >
                  <div className="min-w-0">
                    <p className="truncate font-medium">
                      {tableLabel(row.tableName)} #{row.recordId}
                    </p>
                    <p className="truncate text-gray-500">
                      {formatDateShort(row.createdAt)} om {formatTime(row.createdAt)} · {row.username ?? "Systeem"}
                    </p>
                    <p className="truncate text-xs text-gray-400">
                      <ChangeSummary row={row} />
                    </p>
                  </div>
                  <ActionBadge action={row.action} />
                </button>
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
          itemLabel="wijzigingen"
          onPageChange={setPage}
          onPageSizeChange={(size) => {
            setPageSize(size);
            setPage(1);
          }}
        />
      )}

      <Modal
        title={detail ? `${tableLabel(detail.tableName)} #${detail.recordId}` : ""}
        open={detail !== null}
        onClose={() => setDetail(null)}
      >
        {detail && <AuditDetail row={detail} />}
      </Modal>
    </div>
  );
}

function ActionBadge({ action }: { action: string }) {
  const { label, cls } = ACTION_LABELS[action] ?? { label: action, cls: "bg-gray-100 text-gray-600" };
  return (
    <span className={`inline-block shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${cls}`}>{label}</span>
  );
}

/** Short description of what changed: field names for updates, otherwise the action. */
function ChangeSummary({ row }: { row: AuditLogDto }) {
  if (row.action !== "UPDATE") return <>{row.action === "CREATE" ? "Nieuw record" : "Record verwijderd"}</>;
  const fields = changedFields(row.before, row.after);
  return <>{fields.length ? fields.join(", ") : "Geen veldwijzigingen"}</>;
}

/** Before/after detail; for updates the changed fields are highlighted first. */
function AuditDetail({ row }: { row: AuditLogDto }) {
  const fields = row.action === "UPDATE" ? changedFields(row.before, row.after) : [];
  const before = row.before as Record<string, unknown> | null;
  const after = row.after as Record<string, unknown> | null;

  return (
    <div className="space-y-3 text-sm">
      <p className="text-gray-500">
        {ACTION_LABELS[row.action]?.label ?? row.action} door {row.username ?? "Systeem"} op{" "}
        {formatDateShort(row.createdAt)} om {formatTime(row.createdAt)}
      </p>
      {fields.length > 0 && before && after && (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="text-left text-gray-500">
              <tr>
                <th className="py-1 pr-3">Veld</th>
                <th className="py-1 pr-3">Vóór</th>
                <th className="py-1">Na</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {fields.map((f) => (
                <tr key={f}>
                  <td className="py-1 pr-3 font-medium">{f}</td>
                  <td className="py-1 pr-3 text-red-700">{JSON.stringify(before[f])}</td>
                  <td className="py-1 text-green-700">{JSON.stringify(after[f])}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {row.before != null && (
        <details open={row.action === "DELETE"}>
          <summary className="cursor-pointer font-medium text-gray-700">Volledige rij vóór</summary>
          <pre className="mt-1 overflow-x-auto rounded-md bg-gray-50 p-3 text-xs">
            {JSON.stringify(row.before, null, 2)}
          </pre>
        </details>
      )}
      {row.after != null && (
        <details open={row.action === "CREATE"}>
          <summary className="cursor-pointer font-medium text-gray-700">Volledige rij na</summary>
          <pre className="mt-1 overflow-x-auto rounded-md bg-gray-50 p-3 text-xs">
            {JSON.stringify(row.after, null, 2)}
          </pre>
        </details>
      )}
    </div>
  );
}
