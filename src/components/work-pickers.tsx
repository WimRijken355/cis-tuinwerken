"use client";

import { useQuery } from "@tanstack/react-query";
import { apiGet } from "@/lib/api-client";
import type { ChecklistItemDto } from "@/lib/schemas/checklist";
import { RESOURCE_TYPE_LABELS, type ResourceDto } from "@/lib/schemas/resources";
import { sumResourceHours, type TodoResourceDto, type TodoTaskDto } from "@/lib/schemas/todos";

/**
 * Shared pickers for "work" (todos and recurring work): which resources are
 * needed (with hours each) and which checklist tasks have to be done.
 */

export const parseHours = (v: string) => Number(v.replace(",", "."));
export const formatHours = (h: number) => String(h).replace(".", ",");

/** resourceId → hours as typed; presence in the map = selected. */
export type ResourceSelection = Map<number, string>;

export function toResourceSelection(resources: TodoResourceDto[] = []): ResourceSelection {
  return new Map(resources.map((r) => [r.resourceId, formatHours(r.hours)]));
}

export function resourceSelectionToInput(selection: ResourceSelection) {
  return [...selection.entries()].map(([resourceId, h]) => ({ resourceId, hours: parseHours(h) }));
}

export function ResourcePicker({
  value,
  onChange,
  totalHours,
  initial = [],
}: {
  value: ResourceSelection;
  onChange: (next: ResourceSelection) => void;
  /** Total time as typed; prefilled as hours when a resource is ticked. */
  totalHours: string;
  /** Resources already on the record (kept visible even if since deactivated). */
  initial?: TodoResourceDto[];
}) {
  const { data: active } = useQuery({
    queryKey: ["resources", "active"],
    queryFn: () => apiGet<ResourceDto[]>("/api/resources"),
  });

  const inactiveSelected: ResourceDto[] = initial
    .filter((r) => !active?.some((a) => a.id === r.resourceId))
    .map((r) => ({ id: r.resourceId, name: r.name, type: r.type, hourlyRate: 0, rateUnit: "HOUR" as const, active: false }));
  const resources = [...(active ?? []), ...inactiveSelected];

  function toggle(id: number) {
    const next = new Map(value);
    if (next.has(id)) next.delete(id);
    else next.set(id, totalHours || "1");
    onChange(next);
  }

  const chosen = resourceSelectionToInput(value);
  const sum = sumResourceHours(chosen.filter((r) => Number.isFinite(r.hours)));

  return (
    <fieldset>
      <legend className="text-sm font-medium text-gray-700">Resources inplannen</legend>
      {resources.length === 0 ? (
        <p className="mt-1 text-sm text-gray-500">
          Nog geen resources. Voeg medewerkers en machines toe via het menu Resources.
        </p>
      ) : (
        <div className="mt-1 grid gap-3 md:grid-cols-2">
          {[
            { label: "Personen", list: resources.filter((r) => r.type === "PERSON") },
            { label: "Machines", list: resources.filter((r) => r.type === "MACHINE") },
          ]
            .filter((g) => g.list.length > 0)
            .map((group) => (
              <PickerBox key={group.label} title={group.label}>
                {group.list.map((r) => {
                  const isSelected = value.has(r.id);
                  return (
                    <li key={r.id} className="flex items-center gap-2 px-3 py-1.5 text-sm">
                      <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-2">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggle(r.id)}
                          className="h-4 w-4 accent-brand-600"
                        />
                        <span className={`truncate ${r.active ? "" : "text-gray-400"}`}>
                          {r.name}
                          {!r.active && " (inactief)"}
                        </span>
                      </label>
                      {isSelected && (
                        <div className="flex items-center gap-1">
                          <input
                            aria-label={`Uren voor ${r.name}`}
                            inputMode="decimal"
                            value={value.get(r.id)}
                            onChange={(e) => onChange(new Map(value).set(r.id, e.target.value))}
                            className="w-16 rounded-md border border-gray-300 px-2 py-1 text-right text-sm focus:border-brand-500 focus:outline-none"
                            required
                          />
                          <span className="text-xs text-gray-500">u</span>
                        </div>
                      )}
                    </li>
                  );
                })}
              </PickerBox>
            ))}
        </div>
      )}
      {chosen.length > 0 && (
        <p className="mt-2 text-xs text-gray-500">
          {chosen.length} resource{chosen.length === 1 ? "" : "s"} · samen {formatHours(sum)} u (totale
          tijd: {totalHours || "–"} u — hoeft niet gelijk te zijn)
        </p>
      )}
    </fieldset>
  );
}

/**
 * Checklist picker: tick the standard tasks (from Settings) that apply.
 * `value` holds the selected checklist item ids; the resulting order is the
 * order of the master list.
 */
export function ChecklistPicker({
  value,
  onChange,
  initial = [],
}: {
  value: number[];
  onChange: (ids: number[]) => void;
  /** Tasks already on the record (kept visible even if since deactivated). */
  initial?: { checklistItemId: number; name: string }[];
}) {
  const { data: active } = useQuery({
    queryKey: ["checklist-items", "active"],
    queryFn: () => apiGet<ChecklistItemDto[]>("/api/checklist-items"),
  });

  const inactiveSelected = initial
    .filter((t) => !active?.some((a) => a.id === t.checklistItemId))
    .map((t) => ({ id: t.checklistItemId, name: t.name, active: false, sortOrder: Number.MAX_SAFE_INTEGER }));
  const items = [...(active ?? []), ...inactiveSelected];
  const selected = new Set(value);

  function toggle(id: number) {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    // Keep the order of the master list.
    onChange(items.filter((i) => next.has(i.id)).map((i) => i.id));
  }

  return (
    <fieldset>
      <legend className="text-sm font-medium text-gray-700">
        Checklist{value.length > 0 && ` (${value.length})`}
      </legend>
      {items.length === 0 ? (
        <p className="mt-1 text-sm text-gray-500">
          Nog geen checklist-taken. Stel ze in via Instellingen → Checklist.
        </p>
      ) : (
        <div className="mt-1">
          <PickerBox>
            <div className="grid sm:grid-cols-2">
              {items.map((item) => (
                <label
                  key={item.id}
                  className="flex cursor-pointer items-center gap-2 px-3 py-1.5 text-sm hover:bg-gray-50"
                >
                  <input
                    type="checkbox"
                    checked={selected.has(item.id)}
                    onChange={() => toggle(item.id)}
                    className="h-4 w-4 accent-brand-600"
                  />
                  <span className={`truncate ${item.active ? "" : "text-gray-400"}`}>
                    {item.name}
                    {!item.active && " (inactief)"}
                  </span>
                </label>
              ))}
            </div>
          </PickerBox>
        </div>
      )}
    </fieldset>
  );
}

function PickerBox({ title, children }: { title?: string; children: React.ReactNode }) {
  return (
    <div className="max-h-64 overflow-y-auto rounded-md border border-gray-200">
      {title && (
        <p className="sticky top-0 border-b border-gray-100 bg-gray-50 px-3 py-1.5 text-xs font-medium uppercase tracking-wide text-gray-500">
          {title}
        </p>
      )}
      {title ? <ul className="divide-y divide-gray-100">{children}</ul> : children}
    </div>
  );
}

/** Compact "👷 Jan 4u · 🚜 Minigraver 2u" line for lists. */
export function ResourceSummary({ resources }: { resources?: TodoResourceDto[] }) {
  if (!resources || resources.length === 0) return null;
  return (
    <span className="flex flex-wrap gap-1">
      {resources.map((r) => (
        <span
          key={r.resourceId}
          className={`rounded px-1.5 py-0.5 text-xs ${
            r.type === "PERSON" ? "bg-blue-50 text-blue-800" : "bg-amber-50 text-amber-800"
          }`}
          title={RESOURCE_TYPE_LABELS[r.type]}
        >
          {r.type === "PERSON" ? "👷" : "🚜"} {r.name} {formatHours(r.hours)}u
        </span>
      ))}
    </span>
  );
}

/** Checklist of a todo with tick boxes; calls onToggle when a task is (un)ticked. */
export function TodoChecklist({
  tasks,
  onToggle,
  disabled,
}: {
  tasks?: TodoTaskDto[];
  onToggle: (task: TodoTaskDto) => void;
  disabled?: boolean;
}) {
  if (!tasks || tasks.length === 0) return null;
  const done = tasks.filter((t) => t.done).length;
  return (
    <div className="mt-1">
      <p className="text-xs text-gray-500">
        Checklist {done}/{tasks.length}
        <span className="ml-2 inline-block h-1.5 w-16 overflow-hidden rounded-full bg-gray-100 align-middle">
          <span className="block h-full bg-brand-600" style={{ width: `${(done / tasks.length) * 100}%` }} />
        </span>
      </p>
      <ul className="mt-1 space-y-0.5">
        {tasks.map((task) => (
          <li key={task.id}>
            <label className="flex cursor-pointer items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={task.done}
                disabled={disabled}
                onChange={() => onToggle(task)}
                className="h-4 w-4 accent-brand-600"
              />
              <span className={task.done ? "text-gray-400 line-through" : ""}>{task.label}</span>
            </label>
          </li>
        ))}
      </ul>
    </div>
  );
}
