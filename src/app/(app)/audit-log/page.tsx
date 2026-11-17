"use client";

import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { EmptyState, ErrorNote, Modal, PageHeader, Spinner } from "@/components/ui";
import { apiGet } from "@/lib/api-client";
import type { AuditLogDto, AuditLogListResponse } from "@/lib/schemas/audit-log";
import { formatDateShort, formatTime } from "@/lib/time";

/**
 * Overzicht van de audittrail: elke create/update/delete op een zakelijke
 * tabel (zie AUDITED_MODELS in src/lib/audit.ts) staat hier, met wie de
 * wijziging deed en de volledige rij vóór/na.
 */

const TABLE_LABELS: Record<string, string> = {
  Customer: "Klant",
  Todo: "Taak",
  RecurringTemplate: "Terugkerend werk",
  RecurringWindow: "Herhalingsvenster",
  Appointment: "Afspraak",
  Completion: "Registratie",
  LaborEntry: "Uren",
  Worker: "Medewerker",
  PriceListItem: "Prijslijst-item",
  ExtraCharge: "Extra",
  Invoice: "Factuur",
  Setting: "Instelling",
};

const ACTION_LABELS: Record<string, { label: string; cls: string }> = {
  CREATE: { label: "Aangemaakt", cls: "bg-green-100 text-green-800" },
  UPDATE: { label: "Gewijzigd", cls: "bg-blue-100 text-blue-800" },
  DELETE: { label: "Verwijderd", cls: "bg-red-100 text-red-800" },
};

const PAGE_SIZE = 50;

export default function AuditLogPage() {
  const [table, setTable] = useState("");
  const [action, setAction] = useState("");
  const [page, setPage] = useState(1);
  const [detail, setDetail] = useState<AuditLogDto | null>(null);

  const { data, isLoading, error } = useQuery({
    queryKey: ["audit-log", table, action, page],
    queryFn: () => {
      const params = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE) });
      if (table) params.set("table", table);
      if (action) params.set("action", action);
      return apiGet<AuditLogListResponse>(`/api/audit-log?${params.toString()}`);
    },
  });

  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  function resetAndSet(setter: (v: string) => void) {
    return (value: string) => {
      setter(value);
      setPage(1);
    };
  }

  return (
    <div className="p-4 md:p-8">
      <PageHeader title="Audittrail" />

      <div className="mb-4 flex flex-wrap gap-2 text-sm">
        <select
          value={table}
          onChange={(e) => resetAndSet(setTable)(e.target.value)}
          className="rounded-md border border-gray-300 bg-white px-3 py-2"
        >
          <option value="">Alle tabellen</option>
          {Object.entries(TABLE_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        <select
          value={action}
          onChange={(e) => resetAndSet(setAction)(e.target.value)}
          className="rounded-md border border-gray-300 bg-white px-3 py-2"
        >
          <option value="">Alle acties</option>
          {Object.entries(ACTION_LABELS).map(([value, { label }]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </div>

      {isLoading && <Spinner />}
      {error && <ErrorNote message={(error as Error).message} />}

      {data && data.items.length === 0 && (
        <EmptyState>Geen wijzigingen gevonden voor deze filters.</EmptyState>
      )}

      {data && data.items.length > 0 && (
        <ul className="divide-y divide-gray-100 overflow-hidden rounded-lg border border-gray-200 bg-white">
          {data.items.map((row) => (
            <li key={row.id}>
              <button
                type="button"
                onClick={() => setDetail(row)}
                className="flex w-full flex-wrap items-center justify-between gap-3 px-4 py-3 text-left hover:bg-gray-50"
              >
                <div className="min-w-0">
                  <p className="truncate font-medium">
                    {TABLE_LABELS[row.tableName] ?? row.tableName} #{row.recordId}
                  </p>
                  <p className="truncate text-sm text-gray-500">
                    {formatDateShort(row.createdAt)} om {formatTime(row.createdAt)} ·{" "}
                    {row.username ?? "Systeem"}
                  </p>
                </div>
                <span
                  className={`inline-block shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${
                    (ACTION_LABELS[row.action] ?? { cls: "bg-gray-100 text-gray-600" }).cls
                  }`}
                >
                  {ACTION_LABELS[row.action]?.label ?? row.action}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {data && data.total > data.pageSize && (
        <div className="mt-4 flex items-center justify-center gap-4 text-sm">
          <button
            type="button"
            disabled={page <= 1}
            onClick={() => setPage((p) => p - 1)}
            className="rounded-md border border-gray-300 bg-white px-3 py-1 disabled:opacity-40"
          >
            ← Vorige
          </button>
          <span className="text-gray-500">
            Pagina {page} van {totalPages}
          </span>
          <button
            type="button"
            disabled={page >= totalPages}
            onClick={() => setPage((p) => p + 1)}
            className="rounded-md border border-gray-300 bg-white px-3 py-1 disabled:opacity-40"
          >
            Volgende →
          </button>
        </div>
      )}

      <Modal
        title={detail ? `${TABLE_LABELS[detail.tableName] ?? detail.tableName} #${detail.recordId}` : ""}
        open={detail !== null}
        onClose={() => setDetail(null)}
      >
        {detail && (
          <div className="space-y-3 text-sm">
            <p className="text-gray-500">
              {ACTION_LABELS[detail.action]?.label ?? detail.action} door{" "}
              {detail.username ?? "Systeem"} op {formatDateShort(detail.createdAt)} om{" "}
              {formatTime(detail.createdAt)}
            </p>
            {detail.before != null && (
              <div>
                <p className="mb-1 font-medium text-gray-700">Vóór</p>
                <pre className="overflow-x-auto rounded-md bg-gray-50 p-3 text-xs">
                  {JSON.stringify(detail.before, null, 2)}
                </pre>
              </div>
            )}
            {detail.after != null && (
              <div>
                <p className="mb-1 font-medium text-gray-700">Na</p>
                <pre className="overflow-x-auto rounded-md bg-gray-50 p-3 text-xs">
                  {JSON.stringify(detail.after, null, 2)}
                </pre>
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}
