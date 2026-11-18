"use client";

import { useQuery } from "@tanstack/react-query";
import { MultiSelect } from "@/components/multi-select";
import { TextInput } from "@/components/ui";
import { apiGet } from "@/lib/api-client";
import { EMPTY_PLANNING_FILTER, isFilterActive, type PlanningFilter } from "@/lib/planning";
import type { ResourceDto } from "@/lib/schemas/resources";

/**
 * Filters for the "in te plannen" sidebar: free text (todo title, customer,
 * city), one or more cities, one or more resources (e.g. "when do I need to
 * rent the minigraver?") and grouping per city. The same filter fades
 * non-matching blocks in the grid.
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
        <MultiSelect
          ariaLabel="Plaatsen"
          placeholder="Alle plaatsen"
          options={cities.map((c) => ({ value: c, label: c }))}
          value={filter.cities}
          onChange={(selected) => onChange({ ...filter, cities: selected })}
        />
        <MultiSelect
          ariaLabel="Resources"
          placeholder="Alle resources"
          options={(resources ?? []).map((r) => ({
            value: r.id,
            label: `${r.type === "PERSON" ? "👷" : "🚜"} ${r.name}`,
          }))}
          value={filter.resourceIds}
          onChange={(selected) => onChange({ ...filter, resourceIds: selected })}
        />
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
              onClick={() => onChange(EMPTY_PLANNING_FILTER)}
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
