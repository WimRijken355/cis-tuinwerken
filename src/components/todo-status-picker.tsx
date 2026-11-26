"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { TodoDetail } from "@/components/planning/planning-dialogs";
import { ErrorNote, StatusBadge } from "@/components/ui";
import { apiGet, apiSend } from "@/lib/api-client";
import { todoChangedQueryKeys } from "@/lib/query-keys";
import {
  manualStatusOptions,
  manualStatusValue,
  manualStatusWarning,
  type TodoStatus,
} from "@/lib/todo-status";

/**
 * "Status" at the top of every todo editor (TodoEditDialog and the editor on
 * the customer page): set the status by hand, applied at once (separate from
 * "Bewaren"). Loads the todo detail itself (same query as TodoEditDialog, so
 * no extra request there). Rules + confirmation: src/lib/todo-status.ts.
 */
export function TodoStatusPicker({ todoId, onChanged }: { todoId: number; onChanged?: () => void }) {
  const { data: todo } = useQuery({
    queryKey: ["todo", todoId],
    queryFn: () => apiGet<TodoDetail>(`/api/todos/${todoId}`),
  });
  if (!todo) return null;
  return <StatusPicker todo={todo} onChanged={onChanged} />;
}

function StatusPicker({ todo, onChanged }: { todo: TodoDetail; onChanged?: () => void }) {
  const queryClient = useQueryClient();
  const plannedBlocks = todo.appointments.filter((a) => a.status === "PLANNED").length;
  const uninvoicedDays = (todo.registrations ?? []).filter((r) => r.invoice === null).length;
  const current = manualStatusValue(todo.status, plannedBlocks);

  const mutation = useMutation({
    mutationFn: (status: TodoStatus) => apiSend(`/api/todos/${todo.id}/status`, "PUT", { status }),
    onSuccess: () => {
      for (const queryKey of todoChangedQueryKeys(todo.id)) void queryClient.invalidateQueries({ queryKey });
      void queryClient.invalidateQueries({ queryKey: ["appointment"] });
      void queryClient.invalidateQueries({ queryKey: ["customer"] });
      onChanged?.();
    },
  });

  function choose(status: TodoStatus) {
    if (status === current) return;
    const warning = manualStatusWarning(status, {
      plannedBlocks,
      uninvoicedDays,
      invoiceable: todo.customerId !== null && !todo.isProject,
    });
    if (warning && !window.confirm(warning)) return;
    mutation.mutate(status);
  }

  return (
    // A div, not a <label>/<Field>: no clickable elements inside a label (Safari, see CLAUDE.md).
    <div className="mb-3 rounded-md border border-gray-200 px-3 py-2">
      <div className="flex items-center justify-between gap-3">
        <span className="flex items-center gap-2 text-sm font-medium text-gray-700">
          Status <StatusBadge status={todo.status} />
        </span>
        <select
          aria-label="Status wijzigen"
          value={current}
          disabled={mutation.isPending}
          onChange={(e) => choose(e.target.value as TodoStatus)}
          className="min-h-11 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus:border-brand-500 focus:outline-none"
        >
          {manualStatusOptions(plannedBlocks).map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>
      <p className="mt-1 text-xs text-gray-500">
        Wordt meteen aangepast. Klaar of geannuleerd haalt de nog geplande blokken uit de planning.
      </p>
      {mutation.error && <ErrorNote message={(mutation.error as Error).message} />}
    </div>
  );
}
