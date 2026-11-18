"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { apiGet, apiSend } from "@/lib/api-client";
import { Button, ErrorNote, TextInput } from "./ui";

interface SortableItem {
  id: number;
  name: string;
  active: boolean;
  sortOrder: number;
}

/**
 * Manages a user-sortable master list: add, rename, reorder (▲▼),
 * (de)activate and delete. Used for the checklist and the losse todo-types.
 * The API at `apiPath` follows one shape: GET ?includeInactive=1, POST,
 * PATCH/DELETE :id and POST :id/move { direction }.
 */
export function SortableListManager({
  apiPath,
  queryKey,
  intro,
  newPlaceholder,
  emptyText = "Nog niets toegevoegd.",
}: {
  apiPath: string;
  queryKey: string;
  intro: React.ReactNode;
  newPlaceholder: string;
  emptyText?: string;
}) {
  const queryClient = useQueryClient();
  const [newName, setNewName] = useState("");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editName, setEditName] = useState("");

  const { data: items } = useQuery({
    queryKey: [queryKey, "all"],
    queryFn: () => apiGet<SortableItem[]>(`${apiPath}?includeInactive=1`),
  });

  const invalidate = () => void queryClient.invalidateQueries({ queryKey: [queryKey] });

  const addMutation = useMutation({
    mutationFn: () => apiSend(apiPath, "POST", { name: newName }),
    onSuccess: () => {
      setNewName("");
      invalidate();
    },
  });

  const patchMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<SortableItem> }) =>
      apiSend(`${apiPath}/${id}`, "PATCH", data),
    onSuccess: () => {
      setEditingId(null);
      invalidate();
    },
  });

  const moveMutation = useMutation({
    mutationFn: ({ id, direction }: { id: number; direction: -1 | 1 }) =>
      apiSend(`${apiPath}/${id}/move`, "POST", { direction }),
    onSuccess: invalidate,
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiSend(`${apiPath}/${id}`, "DELETE"),
    onSuccess: invalidate,
  });

  const error = addMutation.error ?? patchMutation.error ?? moveMutation.error ?? deleteMutation.error;
  const list = items ?? [];
  const iconBtn =
    "rounded px-1.5 py-0.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700 disabled:opacity-30 disabled:hover:bg-transparent";

  return (
    <section className="rounded-lg border border-gray-200 bg-white p-4">
      <p className="text-sm text-gray-600">{intro}</p>
      {error && (
        <div className="mt-2">
          <ErrorNote message={(error as Error).message} />
        </div>
      )}

      {list.length === 0 ? (
        <p className="mt-3 text-sm text-gray-500">{emptyText}</p>
      ) : (
        <ul className="mt-3 divide-y divide-gray-100">
          {list.map((item, index) => (
            <li key={item.id} className="flex items-center gap-2 py-1.5 text-sm">
              <div className="flex shrink-0 flex-col leading-none">
                <button
                  type="button"
                  className={iconBtn}
                  disabled={index === 0 || moveMutation.isPending}
                  onClick={() => moveMutation.mutate({ id: item.id, direction: -1 })}
                  aria-label={`${item.name} omhoog`}
                >
                  ▲
                </button>
                <button
                  type="button"
                  className={iconBtn}
                  disabled={index === list.length - 1 || moveMutation.isPending}
                  onClick={() => moveMutation.mutate({ id: item.id, direction: 1 })}
                  aria-label={`${item.name} omlaag`}
                >
                  ▼
                </button>
              </div>

              {editingId === item.id ? (
                <form
                  className="flex flex-1 items-center gap-2"
                  onSubmit={(e) => {
                    e.preventDefault();
                    patchMutation.mutate({ id: item.id, data: { name: editName } });
                  }}
                >
                  <TextInput value={editName} onChange={(e) => setEditName(e.target.value)} autoFocus required />
                  <Button type="submit" disabled={patchMutation.isPending}>
                    Bewaren
                  </Button>
                  <Button type="button" variant="ghost" onClick={() => setEditingId(null)}>
                    Annuleren
                  </Button>
                </form>
              ) : (
                <>
                  <span className={`flex-1 ${item.active ? "" : "text-gray-400 line-through"}`}>{item.name}</span>
                  <div className="flex shrink-0 gap-3 text-xs">
                    <button
                      type="button"
                      className="text-brand-600 hover:underline"
                      onClick={() => {
                        setEditingId(item.id);
                        setEditName(item.name);
                      }}
                    >
                      Hernoemen
                    </button>
                    <button
                      type="button"
                      className="text-brand-600 hover:underline"
                      onClick={() => patchMutation.mutate({ id: item.id, data: { active: !item.active } })}
                    >
                      {item.active ? "Deactiveren" : "Activeren"}
                    </button>
                    <button
                      type="button"
                      className="text-red-500 hover:underline"
                      onClick={() => {
                        if (confirm(`"${item.name}" verwijderen?`)) deleteMutation.mutate(item.id);
                      }}
                    >
                      Verwijderen
                    </button>
                  </div>
                </>
              )}
            </li>
          ))}
        </ul>
      )}

      <form
        className="mt-3 flex items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          addMutation.mutate();
        }}
      >
        <TextInput
          placeholder={newPlaceholder}
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          required
        />
        <Button type="submit" disabled={addMutation.isPending}>
          + Toevoegen
        </Button>
      </form>
    </section>
  );
}
