"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useMemo, useState } from "react";
import { FilterBar, FilterField, Pagination, selectClass } from "@/components/pagination";
import { CreateTodoDialog, type TodoDetail, TodoEditDialog } from "@/components/planning/planning-dialogs";
import { Button, EmptyState, ErrorNote, PageHeader, Spinner, StatusBadge } from "@/components/ui";
import { apiGet, apiSend } from "@/lib/api-client";
import { DEFAULT_PAGE_SIZE } from "@/lib/pagination";
import { formatMinutesAsHours } from "@/lib/planning";
import { todoChangedQueryKeys } from "@/lib/query-keys";
import type { TodoDto } from "@/lib/schemas/todos";
import { formatDateShort, formatTime } from "@/lib/time";
import {
  DEFAULT_TODO_FILTER,
  filterTodos,
  isTodoFilterActive,
  TODO_KIND_OPTIONS,
  TODO_STATE_OPTIONS,
  type TodoKindFilter,
  type TodoListFilter,
  type TodoStateFilter,
  todoStatusActions,
} from "@/lib/todo-list";

/**
 * Overview of all todos (over all customers + losse todo's), like Facturen:
 * a compact table with filters (open/afgewerkt, text, kind, resource), a
 * button for a new todo and the same todo dialog as in the planning (✏️),
 * extended with the todo's blocks and cancel/reopen/delete.
 */
const inputClass = "w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm";

type TodoRow = TodoDto & { createdAt: string };

export default function TodosPage() {
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<TodoListFilter>(DEFAULT_TODO_FILTER);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(DEFAULT_PAGE_SIZE);
  const [detailId, setDetailId] = useState<number | null>(null);
  const [creating, setCreating] = useState(false);

  const { data: todos, isLoading, error } = useQuery({
    queryKey: ["todos", "all"],
    queryFn: () => apiGet<TodoRow[]>("/api/todos"),
  });

  const filtered = useMemo(() => filterTodos(todos ?? [], filter), [todos, filter]);
  const visible = filtered.slice((page - 1) * pageSize, page * pageSize);
  // Resource filter options: every resource that occurs on a todo.
  const resourceOptions = useMemo(() => {
    const byId = new Map<number, string>();
    for (const t of todos ?? []) for (const r of t.resources ?? []) byId.set(r.resourceId, r.name);
    return [...byId].sort((a, b) => a[1].localeCompare(b[1], "nl"));
  }, [todos]);

  const updateFilter = (patch: Partial<TodoListFilter>) => {
    setFilter((f) => ({ ...f, ...patch }));
    setPage(1);
  };

  const refresh = (todoId?: number) => {
    const keys = todoId !== undefined ? todoChangedQueryKeys(todoId) : [["todos"]];
    for (const queryKey of keys) void queryClient.invalidateQueries({ queryKey });
  };

  return (
    <div className="p-4 md:p-8">
      <PageHeader title="Todo's" actions={<Button onClick={() => setCreating(true)}>+ Nieuwe todo</Button>} />

      <FilterBar active={isTodoFilterActive(filter)} onReset={() => updateFilter(DEFAULT_TODO_FILTER)}>
        <FilterField label="Zoeken" className="w-full sm:w-56">
          <input
            type="search"
            value={filter.text}
            onChange={(e) => updateFilter({ text: e.target.value })}
            placeholder="Titel, klant, gemeente"
            className={inputClass}
          />
        </FilterField>
        <FilterField label="Status" className="w-full sm:w-64">
          <select
            value={filter.state}
            onChange={(e) => updateFilter({ state: e.target.value as TodoStateFilter })}
            className={selectClass}
          >
            {TODO_STATE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </FilterField>
        <FilterField label="Soort" className="w-[calc(50%-0.25rem)] sm:w-48">
          <select
            value={filter.kind}
            onChange={(e) => updateFilter({ kind: e.target.value as TodoKindFilter })}
            className={selectClass}
          >
            {TODO_KIND_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </FilterField>
        <FilterField label="Resource" className="w-[calc(50%-0.25rem)] sm:w-40">
          <select
            value={filter.resourceId ?? ""}
            onChange={(e) => updateFilter({ resourceId: e.target.value ? Number(e.target.value) : null })}
            className={selectClass}
          >
            <option value="">Alle</option>
            {resourceOptions.map(([id, name]) => (
              <option key={id} value={id}>
                {name}
              </option>
            ))}
          </select>
        </FilterField>
      </FilterBar>

      {isLoading && <Spinner />}
      {error && <ErrorNote message={(error as Error).message} />}

      {todos && todos.length === 0 && <EmptyState>Nog geen todo&apos;s. Maak er een aan met &quot;+ Nieuwe todo&quot;.</EmptyState>}

      {todos && todos.length > 0 && (
        <>
          {/* Phone: one card per todo; tap = details. */}
          <ul className="space-y-2 md:hidden">
            {visible.length === 0 && (
              <li className="rounded-lg border border-gray-200 bg-white p-4 text-center text-sm text-gray-500">
                Geen todo&apos;s die aan de filters voldoen.
              </li>
            )}
            {visible.map((t) => (
              <li key={t.id}>
                <button
                  type="button"
                  onClick={() => setDetailId(t.id)}
                  className="block min-h-11 w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-left active:bg-gray-50"
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="min-w-0 truncate font-medium text-gray-900">
                      {t.customerId === null ? `📌 ${t.customerName || "Losse todo"}` : t.customerName}
                      {t.customerCity && <span className="font-normal text-gray-500"> · {t.customerCity}</span>}
                    </span>
                    <span className="shrink-0"><StatusBadge status={t.status} /></span>
                  </div>
                  <div className="mt-0.5 flex items-baseline justify-between gap-2 text-sm">
                    <span className="min-w-0 truncate text-gray-700">{t.title}</span>
                    <span className="shrink-0 tabular-nums text-gray-500">
                      {formatMinutesAsHours(t.estimatedHours * 60)}
                    </span>
                  </div>
                </button>
              </li>
            ))}
          </ul>

          <div className="hidden overflow-x-auto rounded-lg border border-gray-200 bg-white md:block">
            <table className="w-full text-sm">
              <thead className="border-b border-gray-200 bg-gray-50 text-left text-xs font-medium uppercase tracking-wide text-gray-500">
                <tr>
                  <th className="px-3 py-2">Klant</th>
                  <th className="px-3 py-2">Todo</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2 text-right">Uren</th>
                  <th className="hidden px-3 py-2 md:table-cell">Resources</th>
                  <th className="hidden px-3 py-2 lg:table-cell">Voorkeur</th>
                  <th className="hidden px-3 py-2 xl:table-cell">Checklist</th>
                  <th className="hidden px-3 py-2 2xl:table-cell">Aangemaakt</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {visible.length === 0 && (
                  <tr>
                    <td colSpan={9} className="px-3 py-6 text-center text-gray-500">
                      Geen todo&apos;s die aan de filters voldoen.
                    </td>
                  </tr>
                )}
                {visible.map((t) => {
                  const tasks = t.tasks ?? [];
                  const active = t.status === "OPEN" || t.status === "PLANNED";
                  return (
                    <tr
                      key={t.id}
                      onDoubleClick={() => setDetailId(t.id)}
                      className={`hover:bg-gray-50 ${active ? "" : "text-gray-500"}`}
                    >
                      <td className="max-w-[14rem] px-3 py-1.5">
                        <div className="truncate whitespace-nowrap">
                          {t.customerId === null ? (
                            <span title="Losse todo (geen klant)">📌 {t.customerName || "Losse todo"}</span>
                          ) : (
                            <Link href={`/customers/${t.customerId}`} className="font-medium text-gray-900 hover:underline">
                              {t.customerName}
                            </Link>
                          )}
                        </div>
                        {t.customerCity && <div className="truncate text-xs text-gray-500">{t.customerCity}</div>}
                      </td>
                      <td className="max-w-[18rem] truncate whitespace-nowrap px-3 py-1.5" title={t.title}>
                        {t.title}
                      </td>
                      <td className="whitespace-nowrap px-3 py-1.5">
                        <span className="shrink-0"><StatusBadge status={t.status} /></span>
                      </td>
                      <td className="whitespace-nowrap px-3 py-1.5 text-right tabular-nums">
                        {formatMinutesAsHours(t.estimatedHours * 60)}
                        {active && (t.remainingMinutes ?? 0) > 0 && (t.plannedMinutes ?? 0) > 0 && (
                          <div className="text-xs text-amber-700">
                            nog {formatMinutesAsHours(t.remainingMinutes ?? 0)} in te plannen
                          </div>
                        )}
                      </td>
                      <td className="hidden max-w-[12rem] truncate whitespace-nowrap px-3 py-1.5 text-xs md:table-cell">
                        {(t.resources ?? []).map((r) => r.name).join(", ")}
                      </td>
                      <td className="hidden whitespace-nowrap px-3 py-1.5 text-xs lg:table-cell">{t.windowLabel ?? ""}</td>
                      <td className="hidden whitespace-nowrap px-3 py-1.5 text-xs tabular-nums xl:table-cell">
                        {tasks.length > 0 ? `${tasks.filter((x) => x.done).length}/${tasks.length}` : ""}
                      </td>
                      <td className="hidden whitespace-nowrap px-3 py-1.5 text-xs tabular-nums 2xl:table-cell">
                        {formatDateShort(t.createdAt)}
                      </td>
                      <td className="px-2 py-1.5 text-right">
                        <button
                          type="button"
                          onClick={() => setDetailId(t.id)}
                          title="Details bekijken / bewerken"
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
            itemLabel="todo's"
          />
        </>
      )}

      {creating && (
        <CreateTodoDialog
          onClose={() => setCreating(false)}
          onCreated={() => {
            setCreating(false);
            refresh();
          }}
        />
      )}

      {detailId !== null && (
        <TodoEditDialog
          todoId={detailId}
          onClose={() => setDetailId(null)}
          onSaved={() => {
            refresh(detailId);
            setDetailId(null);
          }}
          extra={(todo) => (
            <TodoBlocksAndActions
              todo={todo}
              onChanged={() => refresh(todo.id)}
              onDeleted={() => {
                setDetailId(null);
                refresh();
              }}
            />
          )}
        />
      )}
    </div>
  );
}

/** Below the todo editor: its planned/registered blocks and cancel/reopen/delete. */
function TodoBlocksAndActions({
  todo,
  onChanged,
  onDeleted,
}: {
  todo: TodoDetail;
  onChanged: () => void;
  onDeleted: () => void;
}) {
  const actions = todoStatusActions(todo.status, todo.appointments);
  const blocks = [...todo.appointments].sort((a, b) => a.startAt.localeCompare(b.startAt));

  const statusMutation = useMutation({
    mutationFn: (status: "OPEN" | "CANCELLED") => apiSend(`/api/todos/${todo.id}`, "PATCH", { status }),
    onSuccess: onChanged,
  });
  const deleteMutation = useMutation({
    mutationFn: () => apiSend(`/api/todos/${todo.id}`, "DELETE"),
    onSuccess: onDeleted,
  });
  const actionError = statusMutation.error ?? deleteMutation.error;
  const busy = statusMutation.isPending || deleteMutation.isPending;

  return (
    <div className="mt-4 space-y-3 border-t border-gray-100 pt-3">
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium text-gray-700">Status:</span>
        <StatusBadge status={todo.status} />
      </div>

      <div>
        <h3 className="mb-1 text-sm font-medium text-gray-700">Blokken ({blocks.length})</h3>
        {blocks.length === 0 ? (
          <p className="text-xs text-gray-500">Nog niet ingepland. Inplannen doe je in de Planning.</p>
        ) : (
          <ul className="divide-y divide-gray-100 rounded-md border border-gray-200 text-sm">
            {blocks.map((b) => {
              const end = new Date(new Date(b.startAt).getTime() + b.durationMinutes * 60000);
              return (
                <li
                  key={b.id}
                  className={`flex items-center justify-between gap-2 px-2 py-1 ${
                    b.status === "CANCELLED" ? "text-gray-400 line-through" : ""
                  }`}
                >
                  <span className="tabular-nums">
                    {formatDateShort(b.startAt)} {formatTime(b.startAt)}–{formatTime(end)}
                  </span>
                  <StatusBadge status={b.status} />
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {actionError && <ErrorNote message={(actionError as Error).message} />}
      {(actions.canCancel || actions.canReopen || actions.canDelete) && (
        <div className="flex flex-wrap gap-2">
          {actions.canReopen && (
            <Button variant="secondary" disabled={busy} onClick={() => statusMutation.mutate("OPEN")}>
              ↺ Heropenen
            </Button>
          )}
          {actions.canCancel && (
            <Button variant="secondary" disabled={busy} onClick={() => statusMutation.mutate("CANCELLED")}>
              Annuleren
            </Button>
          )}
          {actions.canDelete && (
            <Button
              variant="danger"
              disabled={busy}
              onClick={() => {
                if (window.confirm(`Todo "${todo.title}" definitief verwijderen?`)) deleteMutation.mutate();
              }}
            >
              🗑 Verwijderen
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
