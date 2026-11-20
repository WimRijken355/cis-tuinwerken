"use client";

import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { apiSend } from "@/lib/api-client";
import { Button, ErrorNote, TextArea } from "./ui";

/**
 * Customer page → "Gegevens": a free multi-line note about the customer,
 * editable in place (PATCH /api/customers/:id with only `notes`).
 */
export function CustomerNotes({
  customerId,
  notes,
  onSaved,
}: {
  customerId: number;
  notes: string | null;
  onSaved: () => void;
}) {
  const [text, setText] = useState(notes ?? "");
  const changed = text !== (notes ?? "");
  const save = useMutation({
    mutationFn: () => apiSend(`/api/customers/${customerId}`, "PATCH", { notes: text }),
    onSuccess: onSaved,
  });

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4">
      <h2 className="mb-2 font-semibold">Notitie</h2>
      <TextArea
        aria-label="Notitie over deze klant"
        rows={6}
        maxLength={5000}
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Alles wat handig is om te weten: toegang, afspraken, voorkeuren…"
      />
      {save.error && <ErrorNote message={(save.error as Error).message} />}
      <div className="mt-2 flex items-center justify-end gap-2">
        {changed && (
          <button type="button" className="text-sm text-gray-500 hover:underline" onClick={() => setText(notes ?? "")}>
            Annuleren
          </button>
        )}
        <Button type="button" onClick={() => save.mutate()} disabled={!changed || save.isPending}>
          {save.isPending ? "Bezig…" : save.isSuccess && !changed ? "✓ Bewaard" : "Bewaren"}
        </Button>
      </div>
    </div>
  );
}
