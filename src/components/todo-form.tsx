"use client";

import { useState } from "react";
import { Button, ErrorNote, Field, TextInput } from "@/components/ui";
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
}: {
  initial?: {
    title: string;
    estimatedHours: number;
    resources: TodoResourceDto[];
    tasks: TodoTaskDto[];
  };
  submitLabel: string;
  busy?: boolean;
  error?: string | null;
  onSubmit: (values: TodoFormValues) => void;
  onCancel?: () => void;
}) {
  const initialTasks = (initial?.tasks ?? [])
    .filter((t): t is TodoTaskDto & { checklistItemId: number } => t.checklistItemId !== null)
    .map((t) => ({ checklistItemId: t.checklistItemId, name: t.label }));

  const [title, setTitle] = useState(initial?.title ?? "");
  const [hours, setHours] = useState(initial ? formatHours(initial.estimatedHours) : "2");
  const [resources, setResources] = useState<ResourceSelection>(() => toResourceSelection(initial?.resources));
  const [taskIds, setTaskIds] = useState<number[]>(initialTasks.map((t) => t.checklistItemId));

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit({
          title,
          estimatedHours: parseHours(hours),
          resources: resourceSelectionToInput(resources),
          taskIds,
        });
      }}
    >
      {error && <ErrorNote message={error} />}
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-48 flex-1">
          <Field label="Wat moet er gebeuren?">
            <TextInput
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="bv. Gazon aanleggen achtertuin"
              required
            />
          </Field>
        </div>
        <div className="w-32">
          <Field label="Totale tijd (uren)">
            <TextInput value={hours} onChange={(e) => setHours(e.target.value)} inputMode="decimal" required />
          </Field>
        </div>
      </div>

      <ChecklistPicker value={taskIds} onChange={setTaskIds} initial={initialTasks} />
      <ResourcePicker value={resources} onChange={setResources} totalHours={hours} initial={initial?.resources} />

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
