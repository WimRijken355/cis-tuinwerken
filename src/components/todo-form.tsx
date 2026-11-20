"use client";

import { useState } from "react";
import { Button, ErrorNote, Field, TextArea, TextInput, Toggle } from "@/components/ui";
import type { TodoResourceDto, TodoResourceInput, TodoTaskDto } from "@/lib/schemas/todos";
import {
  ChecklistPicker,
  formatHours,
  parseHours,
  ResourcePicker,
  resourceSelectionToInput,
  toResourceSelection,
  type ResourceSelection,
} from "./work-pickers";

export interface TodoFormValues {
  title: string;
  estimatedHours: number;
  resources: TodoResourceInput[];
  taskIds: number[];
  /** Preferred period "yyyy-MM" (only when showPeriod). */
  preferredFrom?: string;
  preferredTo?: string;
  /** Project: invoiced directly in EF (only when showProject). */
  isProject?: boolean;
  /** Free note (multi-line). */
  description?: string;
  /** Invoice description for the labour lines ("" = default; only when showProject). */
  invoiceDescription?: string;
}

/**
 * Todo form: title, total estimated time, the checklist of tasks and the
 * resources (people/machines) to plan, each with its own hours. The total
 * does not have to equal the sum of the resource hours.
 */
export function TodoForm({
  initial,
  submitLabel,
  busy,
  error,
  onSubmit,
  onCancel,
  showChecklist = true,
  titleLabel = "Wat moet er gebeuren?",
  titlePlaceholder = "bv. Gazon aanleggen achtertuin",
  titleSuggestions = [],
  showPeriod = false,
  showProject = false,
  extra,
}: {
  initial?: {
    title: string;
    estimatedHours: number;
    resources: TodoResourceDto[];
    tasks: TodoTaskDto[];
    isProject?: boolean;
    description?: string | null;
    invoiceDescription?: string | null;
  };
  submitLabel: string;
  busy?: boolean;
  error?: string | null;
  onSubmit: (values: TodoFormValues) => void;
  onCancel?: () => void;
  /** Losse todo's (holiday, doctor, ...) have no checklist. */
  showChecklist?: boolean;
  titleLabel?: string;
  titlePlaceholder?: string;
  /** Quick picks that fill in the title (e.g. "Vakantie"). */
  titleSuggestions?: string[];
  /** Ask for a preferred period (month, optionally a range), e.g. "april 2027". */
  showPeriod?: boolean;
  /** Offer the "Project" toggle (customer todos only; a losse todo is never invoiced). */
  showProject?: boolean;
  /** Extra controls shown above the buttons (e.g. the quote line picker). */
  extra?: React.ReactNode;
}) {
  const initialTasks = (initial?.tasks ?? [])
    .filter((t): t is TodoTaskDto & { checklistItemId: number } => t.checklistItemId !== null)
    .map((t) => ({ checklistItemId: t.checklistItemId, name: t.label }));

  const [title, setTitle] = useState(initial?.title ?? "");
  const [hours, setHours] = useState(initial ? formatHours(initial.estimatedHours) : "2");
  const [resources, setResources] = useState<ResourceSelection>(() => toResourceSelection(initial?.resources));
  const [taskIds, setTaskIds] = useState<number[]>(initialTasks.map((t) => t.checklistItemId));
  const [preferredFrom, setPreferredFrom] = useState("");
  const [preferredTo, setPreferredTo] = useState("");
  const [isProject, setIsProject] = useState(initial?.isProject ?? false);
  const [description, setDescription] = useState(initial?.description ?? "");
  const [invoiceDescription, setInvoiceDescription] = useState(initial?.invoiceDescription ?? "");

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit({
          title,
          estimatedHours: parseHours(hours),
          resources: resourceSelectionToInput(resources),
          taskIds: showChecklist ? taskIds : [],
          ...(showPeriod && preferredFrom ? { preferredFrom, preferredTo: preferredTo || undefined } : {}),
          description,
          ...(showProject ? { isProject, invoiceDescription: isProject ? "" : invoiceDescription } : {}),
        });
      }}
    >
      {error && <ErrorNote message={error} />}
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-48 flex-1">
          <Field label={titleLabel}>
            <TextInput
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={titlePlaceholder}
              required
            />
          </Field>
          {titleSuggestions.length > 0 && (
            <div className="mt-1 flex flex-wrap gap-1">
              {titleSuggestions.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setTitle(s)}
                  className={`rounded-full px-2 py-0.5 text-xs ${
                    title === s ? "bg-brand-600 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="w-32">
          <Field label="Totale tijd (uren)">
            <TextInput value={hours} onChange={(e) => setHours(e.target.value)} inputMode="decimal" required />
          </Field>
        </div>
      </div>

      <Field label="Notitie (optioneel)">
        <TextArea
          rows={3}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Uitgebreide info, bv. toegang via de zijpoort, hond in de tuin…"
        />
      </Field>
      {showProject && !isProject && (
        <Field
          label="Facturatieomschrijving (optioneel)"
          hint="Vervangt &quot;Werkuren op <datum>&quot; op de factuur. Leeg = standaard; bij meerdere dagen komt de datum erachter."
        >
          <TextInput
            value={invoiceDescription}
            maxLength={200}
            onChange={(e) => setInvoiceDescription(e.target.value)}
            placeholder="bv. Tuinonderhoud volgens afspraak"
          />
        </Field>
      )}

      {showPeriod && (
        <fieldset>
          <legend className="text-sm font-medium text-gray-700">Voorkeursperiode (optioneel)</legend>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-sm">
            <TextInput
              type="month"
              aria-label="Vanaf maand"
              value={preferredFrom}
              onChange={(e) => setPreferredFrom(e.target.value)}
              className="!w-44"
            />
            <span className="text-gray-500">tot</span>
            <TextInput
              type="month"
              aria-label="Tot maand"
              value={preferredTo}
              min={preferredFrom || undefined}
              onChange={(e) => setPreferredTo(e.target.value)}
              className="!w-44"
              disabled={!preferredFrom}
            />
          </div>
          <p className="mt-1 text-xs text-gray-400">Bv. april 2027. Laat &quot;tot&quot; leeg voor één maand.</p>
        </fieldset>
      )}
      {showProject && (
        <label className="flex items-start justify-between gap-3 rounded-md border border-gray-200 px-3 py-2">
          <span>
            <span className="block text-sm font-medium text-gray-700">Project</span>
            <span className="block text-xs text-gray-500">
              Wordt rechtstreeks in EenvoudigFactureren gefactureerd: je registreert wel uren, maar er wordt geen
              factuur aangemaakt.
            </span>
          </span>
          <Toggle checked={isProject} onChange={setIsProject} label="Project" />
        </label>
      )}
      {showChecklist && <ChecklistPicker value={taskIds} onChange={setTaskIds} initial={initialTasks} />}
      <ResourcePicker value={resources} onChange={setResources} totalHours={hours} initial={initial?.resources} />
      {extra}

      <div className="flex justify-end gap-2">
        {onCancel && (
          <Button type="button" variant="ghost" onClick={onCancel}>
            Annuleren
          </Button>
        )}
        <Button type="submit" disabled={busy}>
          {busy ? "Bezig…" : submitLabel}
        </Button>
      </div>
    </form>
  );
}
