"use client";

import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Button, ErrorNote, Field, TextInput } from "@/components/ui";
import { apiGet } from "@/lib/api-client";
import { RESOURCE_TYPE_LABELS, type ResourceDto } from "@/lib/schemas/resources";
import { sumResourceHours, type TodoResourceDto, type TodoResourceInput } from "@/lib/schemas/todos";

export interface TodoFormValues {
  title: string;
  estimatedHours: number;
  resources: TodoResourceInput[];
}

const parseNum = (v: string) => Number(v.replace(",", "."));
const formatHours = (h: number) => String(h).replace(".", ",");

/**
 * Todo form: title, total estimated time and the resources (people/machines)
 * that need to be planned, each with its own hours. The total does not have
 * to equal the sum of the resource hours.
 */
export function TodoForm({
  initial,
  submitLabel,
  busy,
  error,
  onSubmit,
  onCancel,
}: {
  initial?: { title: string; estimatedHours: number; resources: TodoResourceDto[] };
  submitLabel: string;
  busy?: boolean;
  error?: string | null;
  onSubmit: (values: TodoFormValues) => void;
  onCancel?: () => void;
}) {
  const [title, setTitle] = useState(initial?.title ?? "");
  const [hours, setHours] = useState(initial ? formatHours(initial.estimatedHours) : "2");
  // resourceId → hours as typed; presence in the map = selected.
  const [selected, setSelected] = useState<Map<number, string>>(
    () => new Map((initial?.resources ?? []).map((r) => [r.resourceId, formatHours(r.hours)])),
  );

  const { data: active } = useQuery({
    queryKey: ["resources", "active"],
    queryFn: () => apiGet<ResourceDto[]>("/api/resources"),
  });

  // Keep resources that are already on the todo visible even if since deactivated.
  const inactiveSelected: ResourceDto[] = (initial?.resources ?? [])
    .filter((r) => !active?.some((a) => a.id === r.resourceId))
    .map((r) => ({ id: r.resourceId, name: r.name, type: r.type, hourlyRate: 0, active: false }));
  const resources = [...(active ?? []), ...inactiveSelected];
  const persons = resources.filter((r) => r.type === "PERSON");
  const machines = resources.filter((r) => r.type === "MACHINE");

  function toggle(id: number) {
    setSelected((prev) => {
      const next = new Map(prev);
      if (next.has(id)) next.delete(id);
      else next.set(id, hours || "1");
      return next;
    });
  }

  function setResourceHours(id: number, value: string) {
    setSelected((prev) => new Map(prev).set(id, value));
  }

  const chosen = [...selected.entries()].map(([resourceId, h]) => ({ resourceId, hours: parseNum(h) }));
  const resourceSum = sumResourceHours(chosen.filter((r) => Number.isFinite(r.hours)));

  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit({ title, estimatedHours: parseNum(hours), resources: chosen });
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

      <fieldset>
        <legend className="text-sm font-medium text-gray-700">Resources inplannen</legend>
        {resources.length === 0 ? (
          <p className="mt-1 text-sm text-gray-500">
            Nog geen resources. Voeg medewerkers en machines toe via het menu Resources.
          </p>
        ) : (
          <div className="mt-1 grid gap-3 md:grid-cols-2">
            {[
              { label: "Personen", list: persons },
              { label: "Machines", list: machines },
            ]
              .filter((g) => g.list.length > 0)
              .map((group) => (
                <div key={group.label} className="rounded-md border border-gray-200">
                  <p className="border-b border-gray-100 bg-gray-50 px-3 py-1.5 text-xs font-medium uppercase tracking-wide text-gray-500">
                    {group.label}
                  </p>
                  <ul className="divide-y divide-gray-100">
                    {group.list.map((r) => {
                      const isSelected = selected.has(r.id);
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
                                value={selected.get(r.id)}
                                onChange={(e) => setResourceHours(r.id, e.target.value)}
                                className="w-16 rounded-md border border-gray-300 px-2 py-1 text-right text-sm focus:border-brand-500 focus:outline-none"
                                required
                              />
                              <span className="text-xs text-gray-500">u</span>
                            </div>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))}
          </div>
        )}
        {chosen.length > 0 && (
          <p className="mt-2 text-xs text-gray-500">
            {chosen.length} resource{chosen.length === 1 ? "" : "s"} · samen {formatHours(resourceSum)} u
            {" "}(totale tijd: {hours || "–"} u — hoeft niet gelijk te zijn)
          </p>
        )}
      </fieldset>

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

/** Compact "👷 Jan 4u · 🚜 Minigraver 2u" line for todo lists. */
export function TodoResourceSummary({ resources }: { resources?: TodoResourceDto[] }) {
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
