"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { apiGet, apiSend } from "@/lib/api-client";
import type { ChecklistItemDto } from "@/lib/schemas/checklist";
import { Button, ErrorNote, TextInput } from "./ui";

/**
 * Manages the checklist master list (page /checklist): add, rename,
 * reorder, (de)activate and delete standard tasks.
 */
export function ChecklistManager() {
  const queryClient = useQueryClient();
  const [newName, setNewName] = useState("");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editName, setEditName] = useState("");

  const { data: items } = useQuery({
    queryKey: ["checklist-items", "all"],
    queryFn: () => apiGet<ChecklistItemDto[]>("/api/checklist-items?includeInactive=1"),
  });

  const invalidate = () => void queryClient.invalidateQueries({ queryKey: ["checklist-items"] });

  const addMutation = useMutation({
    mutationFn: () => apiSend("/api/checklist-items", "POST", { name: newName }),
    onSuccess: () => {
      setNewName("");
      invalidate();
    },
  });

  const patchMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<ChecklistItemDto> }) =>
      apiSend(`/api/checklist-items/${id}`, "PATCH", data),
    onSuccess: () => {
      setEditingId(null);
      invalidate();
    },
  });

  const moveMutation = useMutation({
    mutationFn: ({ id, direction }: { id: number; direction: -1 | 1 }) =>
      apiSend(`/api/checklist-items/${id}/move`, "POST", { direction }),
    onSuccess: invalidate,
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiSend(`/api/checklist-items/${id}`, "DELETE"),
    onSuccess: invalidate,
  });

  const error = addMutation.error ?? patchMutation.error ?? moveMutation.error ?? deleteMutation.error;
  const list = items ?? [];
  const iconBtn =
    "rounded px-1.5 py-0.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700 disabled:opacity-30 disabled:hover:bg-transparent";

  return (
    <section className="rounded-lg border border-gray-200 bg-white p-4">
      <p className="text-sm text-gray-600">
        Standaardtaken die je aanvinkt bij een todo of bij terugkerend werk (bv.
        &quot;Haag scheren&quot;, &quot;Snoeiafval afvoeren&quot;). Een bestaande todo houdt
        de naam die de taak had toen hij werd toegevoegd.
      </p>
      {error && (
        <div className="mt-2">
          <ErrorNote message={(error as Error).message} />
        </div>
      )}

      {list.length === 0 ? (
        <p className="mt-3 text-sm text-gray-500">Nog geen taken.</p>
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
                        if (confirm(`Taak "${item.name}" verwijderen?`)) deleteMutation.mutate(item.id);
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
          placeholder="Nieuwe taak, bv. Gras maaien"
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
