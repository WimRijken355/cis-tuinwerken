"use client";

import { useQuery } from "@tanstack/react-query";
import { selectClass } from "@/components/pagination";
import { TextInput } from "@/components/ui";
import { apiGet } from "@/lib/api-client";
import { isFilterActive, type PlanningFilter } from "@/lib/planning";
import type { ResourceDto } from "@/lib/schemas/resources";

/**
 * Filters for the "in te plannen" sidebar: free text (todo title, customer,
 * city), city, resource (e.g. "when do I need to rent the minigraver?") and
 * grouping per city. The same filter fades non-matching blocks in the grid.
 */
export function PlanningFilters({
  filter,
  onChange,
  cities,
  groupByCity,
  onGroupByCityChange,
  shown,
  total,
}: {
  filter: PlanningFilter;
  onChange: (filter: PlanningFilter) => void;
  /** Cities to offer (from the sidebar todos and the blocks in view). */
  cities: string[];
  groupByCity: boolean;
  onGroupByCityChange: (group: boolean) => void;
  shown: number;
  total: number;
}) {
  const { data: resources } = useQuery({
    queryKey: ["resources", "active"],
    queryFn: () => apiGet<ResourceDto[]>("/api/resources"),
  });
  const active = isFilterActive(filter);

  return (
    <div className="mb-2 space-y-1.5 rounded-lg border border-gray-200 bg-white p-2">
      <TextInput
        placeholder="Zoek op todo, klant of plaats…"
        value={filter.text}
        onChange={(e) => onChange({ ...filter, text: e.target.value })}
        className="!py-1.5"
      />
      <div className="flex gap-1.5">
        <select
          aria-label="Plaats"
          value={filter.city}
          onChange={(e) => onChange({ ...filter, city: e.target.value })}
          className={`${selectClass} !px-2 !py-1.5`}
        >
          <option value="">Alle plaatsen</option>
          {cities.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <select
          aria-label="Resource"
          value={filter.resourceId ?? ""}
          onChange={(e) => onChange({ ...filter, resourceId: e.target.value ? Number(e.target.value) : null })}
          className={`${selectClass} !px-2 !py-1.5`}
        >
          <option value="">Alle resources</option>
          {resources?.map((r) => (
            <option key={r.id} value={r.id}>
              {r.type === "PERSON" ? "👷" : "🚜"} {r.name}
            </option>
          ))}
        </select>
      </div>
      <div className="flex items-center justify-between text-xs text-gray-500">
        <label className="flex cursor-pointer items-center gap-1.5">
          <input
            type="checkbox"
            checked={groupByCity}
            onChange={(e) => onGroupByCityChange(e.target.checked)}
            className="h-3.5 w-3.5 accent-brand-600"
          />
          Groeperen per plaats
        </label>
        {active ? (
          <span>
            {shown} van {total} ·{" "}
            <button
              type="button"
              className="text-brand-600 hover:underline"
              onClick={() => onChange({ text: "", city: "", resourceId: null })}
            >
              wissen
            </button>
          </span>
        ) : (
          <span>{total} todo&apos;s</span>
        )}
      </div>
      {active && (
        <p className="text-[11px] text-gray-400">Blokken in de planning die niet voldoen, worden vager getoond.</p>
      )}
    </div>
  );
}
