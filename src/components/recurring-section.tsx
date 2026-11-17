"use client";

import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import {
  MONTH_NAMES_NL,
  type RecurringTemplateDto,
  type RecurringWindowDto,
  windowLabel,
} from "@/lib/schemas/recurring";
import { apiSend } from "@/lib/api-client";
import { Button, ErrorNote, Field, Modal, TextInput } from "./ui";

/**
 * Terugkerend werk op de klantfiche: bv. "Haag scheren, 2×/jaar: Mei + Sep–Okt".
 * Elke periode (window) levert per jaar één todo op, die `leadTimeDays` vóór
 * het begin van de periode in "in te plannen" verschijnt.
 */

interface WindowDraft {
  id?: number;
  startMonth: number;
  endMonth: number;
}

export function RecurringSection({
  customerId,
  templates,
  onChanged,
}: {
  customerId: number;
  templates: RecurringTemplateDto[];
  onChanged: () => void;
}) {
  const [editing, setEditing] = useState<RecurringTemplateDto | "new" | null>(null);

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiSend(`/api/recurring-templates/${id}`, "DELETE"),
    onSuccess: onChanged,
  });

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="font-semibold">Terugkerend werk</h2>
        <Button variant="secondary" onClick={() => setEditing("new")}>
          + Toevoegen
        </Button>
      </div>

      {templates.length === 0 ? (
        <p className="text-sm text-gray-500">
          Bv. &quot;haag scheren, 2× per jaar in mei en september&quot; — de todo
          verschijnt dan vanzelf op tijd in je planning.
        </p>
      ) : (
        <ul className="divide-y divide-gray-100">
          {templates.map((t) => (
            <li key={t.id} className="flex items-center justify-between gap-3 py-2">
              <div className="min-w-0 text-sm">
                <p className={`font-medium ${t.active ? "" : "text-gray-400 line-through"}`}>
                  {t.title}
                </p>
                <p className="text-gray-500">
                  {t.windows.length}×/jaar: {t.windows.map((w) => w.label).join(" + ")} · ±{" "}
                  {t.estimatedHours} u · verschijnt {t.leadTimeDays} dagen vooraf
                </p>
              </div>
              <div className="flex shrink-0 gap-2 text-xs">
                <button
                  type="button"
                  className="text-brand-600 hover:underline"
                  onClick={() => setEditing(t)}
                >
                  Bewerken
                </button>
                <button
                  type="button"
                  className="text-red-500 hover:underline"
                  onClick={() => {
                    if (confirm(`"${t.title}" verwijderen? Al aangemaakte todo's blijven staan.`)) {
                      deleteMutation.mutate(t.id);
                    }
                  }}
                >
                  Verwijderen
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {editing && (
        <RecurringFormModal
          customerId={customerId}
          template={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            onChanged();
          }}
        />
      )}
    </div>
  );
}

function RecurringFormModal({
  customerId,
  template,
  onClose,
  onSaved,
}: {
  customerId: number;
  template: RecurringTemplateDto | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [title, setTitle] = useState(template?.title ?? "");
  const [hours, setHours] = useState(String(template?.estimatedHours ?? 2));
  const [leadTime, setLeadTime] = useState(String(template?.leadTimeDays ?? 30));
  const [windows, setWindows] = useState<WindowDraft[]>(
    template?.windows.map((w: RecurringWindowDto) => ({
      id: w.id,
      startMonth: w.startMonth,
      endMonth: w.endMonth,
    })) ?? [{ startMonth: 5, endMonth: 5 }],
  );

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        title,
        estimatedHours: Number(hours.replace(",", ".")),
        leadTimeDays: Number(leadTime),
        windows: windows.map((w, i) => ({
          id: w.id,
          label: windowLabel(w.startMonth, w.endMonth),
          startMonth: w.startMonth,
          startDay: 1,
          endMonth: w.endMonth,
          endDay: 31,
          sortOrder: i,
        })),
      };
      if (template) {
        await apiSend(`/api/recurring-templates/${template.id}`, "PATCH", payload);
      } else {
        await apiSend("/api/recurring-templates", "POST", { ...payload, customerId });
      }
      // Meteen genereren: valt de periode nu (of binnen de leadtime), dan
      // verschijnt de todo direct in "in te plannen".
      await apiSend("/api/jobs/recurring", "POST");
    },
    onSuccess: onSaved,
  });

  return (
    <Modal
      title={template ? "Terugkerend werk bewerken" : "Terugkerend werk toevoegen"}
      open
      onClose={onClose}
    >
      {saveMutation.error && <ErrorNote message={(saveMutation.error as Error).message} />}
      <form
        className="mt-2 space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          saveMutation.mutate();
        }}
      >
        <Field label="Wat moet er gebeuren?">
          <TextInput
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="bv. Haag scheren"
            required
            autoFocus
          />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Geschat (uren)">
            <TextInput inputMode="decimal" value={hours} onChange={(e) => setHours(e.target.value)} required />
          </Field>
          <Field label="Zichtbaar (dagen vooraf)" hint="Zo lang vóór de periode verschijnt de todo">
            <TextInput inputMode="numeric" value={leadTime} onChange={(e) => setLeadTime(e.target.value)} required />
          </Field>
        </div>

        <div>
          <p className="text-sm font-medium text-gray-700">
            Periodes ({windows.length}×/jaar)
          </p>
          <div className="mt-1 space-y-2">
            {windows.map((w, i) => (
              <div key={i} className="flex items-center gap-2">
                <MonthSelect
                  value={w.startMonth}
                  onChange={(m) =>
                    setWindows((ws) =>
                      ws.map((x, j) =>
                        j === i ? { ...x, startMonth: m, endMonth: Math.max(m, x.endMonth) } : x,
                      ),
                    )
                  }
                />
                <span className="text-gray-400">t/m</span>
                <MonthSelect
                  value={w.endMonth}
                  onChange={(m) => setWindows((ws) => ws.map((x, j) => (j === i ? { ...x, endMonth: m } : x)))}
                />
                <span className="flex-1 text-xs text-gray-400">
                  {windowLabel(w.startMonth, w.endMonth)}
                </span>
                {windows.length > 1 && (
                  <button
                    type="button"
                    className="text-gray-400 hover:text-red-600"
                    onClick={() => setWindows((ws) => ws.filter((_, j) => j !== i))}
                    aria-label="Periode verwijderen"
                  >
                    ✕
                  </button>
                )}
              </div>
            ))}
          </div>
          <button
            type="button"
            className="mt-2 text-sm text-brand-600 hover:underline"
            onClick={() => setWindows((ws) => [...ws, { startMonth: 9, endMonth: 9 }])}
          >
            + Periode toevoegen
          </button>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="secondary" type="button" onClick={onClose}>
            Annuleren
          </Button>
          <Button type="submit" disabled={saveMutation.isPending}>
            {saveMutation.isPending ? "Bezig…" : "Bewaren"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function MonthSelect({ value, onChange }: { value: number; onChange: (m: number) => void }) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(Number(e.target.value))}
      className="rounded-md border border-gray-300 px-2 py-1.5 text-sm"
    >
      {MONTH_NAMES_NL.map((name, i) => (
        <option key={name} value={i + 1}>
          {name}
        </option>
      ))}
    </select>
  );
}
