"use client";

import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { apiGet } from "@/lib/api-client";
import { formatAddress, type CustomerListResponse } from "@/lib/schemas/customers";
import { useDebouncedValue } from "@/lib/use-debounced-value";
import { TextInput } from "./ui";

export interface PickedCustomer {
  id: number;
  name: string;
  address: string;
}

/** Search-as-you-type customer picker (searches the paginated customer list). */
export function CustomerPicker({
  value,
  onChange,
}: {
  value: PickedCustomer | null;
  onChange: (customer: PickedCustomer | null) => void;
}) {
  const [search, setSearch] = useState("");
  const debounced = useDebouncedValue(search.trim());

  const { data, isFetching } = useQuery({
    queryKey: ["customers", "picker", debounced],
    queryFn: () =>
      apiGet<CustomerListResponse>(`/api/customers?page=1&pageSize=8&name=${encodeURIComponent(debounced)}`),
    enabled: value === null,
  });

  if (value) {
    return (
      <div className="flex items-center justify-between gap-2 rounded-md border border-brand-500 bg-brand-50 px-3 py-2 text-sm">
        <div className="min-w-0">
          <p className="truncate font-medium text-brand-900">{value.name}</p>
          {value.address && <p className="truncate text-xs text-gray-500">{value.address}</p>}
        </div>
        <button type="button" className="text-xs text-brand-600 hover:underline" onClick={() => onChange(null)}>
          Wijzigen
        </button>
      </div>
    );
  }

  return (
    <div>
      <TextInput
        placeholder="Zoek klant op naam…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        autoFocus
      />
      <ul className="mt-1 max-h-48 overflow-y-auto rounded-md border border-gray-200 bg-white">
        {isFetching && !data && <li className="px-3 py-2 text-sm text-gray-400">Zoeken…</li>}
        {data?.items.length === 0 && <li className="px-3 py-2 text-sm text-gray-400">Geen klanten gevonden.</li>}
        {data?.items.map((c) => (
          <li key={c.id}>
            <button
              type="button"
              onClick={() => onChange({ id: c.id, name: c.name, address: formatAddress(c) })}
              className="w-full px-3 py-1.5 text-left text-sm hover:bg-gray-50"
            >
              <span className="font-medium">{c.name}</span>
              {c.isDemo && <span className="ml-1 rounded bg-amber-100 px-1 text-[10px] text-amber-800">Demo</span>}
              <span className="block truncate text-xs text-gray-500">{formatAddress(c) || "Geen adres"}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
