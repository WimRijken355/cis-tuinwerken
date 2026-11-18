"use client";

import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { CustomerForm } from "@/components/customer-form";
import { FilterBar, FilterField, Pagination } from "@/components/pagination";
import {
  Button,
  EmptyState,
  ErrorNote,
  Modal,
  PageHeader,
  Spinner,
  TextInput,
} from "@/components/ui";
import { apiGet, apiSend } from "@/lib/api-client";
import { DEFAULT_PAGE_SIZE } from "@/lib/pagination";
import {
  formatAddress,
  type CustomerDto,
  type CustomerInput,
  type CustomerListResponse,
} from "@/lib/schemas/customers";
import { useDebouncedValue } from "@/lib/use-debounced-value";

const EMPTY_FILTERS = { name: "", address: "", postalCode: "", city: "" };
type Filters = typeof EMPTY_FILTERS;

const FILTER_FIELDS: { key: keyof Filters; label: string; placeholder: string; className: string }[] = [
  { key: "name", label: "Naam", placeholder: "Zoek op naam…", className: "min-w-48 flex-1" },
  { key: "address", label: "Adres", placeholder: "Straat…", className: "min-w-40 flex-1" },
  { key: "postalCode", label: "Postcode", placeholder: "bv. 9000", className: "w-28" },
  { key: "city", label: "Woonplaats", placeholder: "Gemeente…", className: "w-44" },
];

export default function CustomersPage() {
  const queryClient = useQueryClient();
  const router = useRouter();
  const [showNew, setShowNew] = useState(false);
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(DEFAULT_PAGE_SIZE);
  const debouncedFilters = useDebouncedValue(filters);

  const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
  for (const [key, value] of Object.entries(debouncedFilters)) {
    if (value.trim()) params.set(key, value.trim());
  }

  const { data, isLoading, error } = useQuery({
    queryKey: ["customers", params.toString()],
    queryFn: () => apiGet<CustomerListResponse>(`/api/customers?${params.toString()}`),
    placeholderData: keepPreviousData,
  });

  const createMutation = useMutation({
    mutationFn: (input: CustomerInput) => apiSend<CustomerDto>("/api/customers", "POST", input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["customers"] });
      setShowNew(false);
    },
  });

  function setFilter(key: keyof Filters, value: string) {
    setFilters((f) => ({ ...f, [key]: value }));
    setPage(1);
  }

  const filtersActive = Object.values(filters).some((v) => v.trim() !== "");
  const customers = data?.items ?? [];

  return (
    <div className="p-4 md:p-8">
      <PageHeader
        title="Klanten"
        actions={<Button onClick={() => setShowNew(true)}>+ Nieuwe klant</Button>}
      />

      <FilterBar
        active={filtersActive}
        onReset={() => {
          setFilters(EMPTY_FILTERS);
          setPage(1);
        }}
      >
        {FILTER_FIELDS.map((f) => (
          <FilterField key={f.key} label={f.label} className={f.className}>
            <TextInput
              placeholder={f.placeholder}
              value={filters[f.key]}
              onChange={(e) => setFilter(f.key, e.target.value)}
            />
          </FilterField>
        ))}
      </FilterBar>

      {isLoading && <Spinner />}
      {error && <ErrorNote message={(error as Error).message} />}

      {data && customers.length === 0 && (
        <EmptyState>
          {filtersActive
            ? "Geen klanten gevonden voor deze filters."
            : "Nog geen klanten. Maak je eerste klant aan, of importeer je bestaande klanten uit EenvoudigFactureren via Instellingen."}
        </EmptyState>
      )}

      {customers.length > 0 && (
        <>
          {/* Desktop: table */}
          <div className="hidden overflow-x-auto rounded-lg border border-gray-200 bg-white md:block">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-left text-xs font-medium uppercase tracking-wide text-gray-500">
                <tr>
                  <th className="px-4 py-2">Naam</th>
                  <th className="px-4 py-2">Adres</th>
                  <th className="px-4 py-2">Postcode</th>
                  <th className="px-4 py-2">Woonplaats</th>
                  <th className="px-4 py-2">E-mail</th>
                  <th className="px-4 py-2">Telefoon</th>
                  <th className="px-4 py-2" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {customers.map((c) => (
                  <tr
                    key={c.id}
                    className="cursor-pointer hover:bg-gray-50"
                    onClick={() => router.push(`/customers/${c.id}`)}
                  >
                    <td className="px-4 py-2 font-medium">
                      <Link href={`/customers/${c.id}`} onClick={(e) => e.stopPropagation()}>
                        {c.name}
                      </Link>
                    </td>
                    <td className="px-4 py-2 text-gray-600">{c.street || <Dash />}</td>
                    <td className="px-4 py-2 text-gray-600">{c.postalCode || <Dash />}</td>
                    <td className="px-4 py-2 text-gray-600">{c.city || <Dash />}</td>
                    <td className="max-w-56 truncate px-4 py-2">
                      {c.email ? (
                        <a
                          href={`mailto:${c.email}`}
                          onClick={(e) => e.stopPropagation()}
                          className="text-brand-600 hover:underline"
                        >
                          {c.email}
                        </a>
                      ) : (
                        <Dash />
                      )}
                    </td>
                    <td className="whitespace-nowrap px-4 py-2">
                      {c.phone ? (
                        <a
                          href={`tel:${c.phone}`}
                          onClick={(e) => e.stopPropagation()}
                          className="text-brand-600 hover:underline"
                        >
                          {c.phone}
                        </a>
                      ) : (
                        <Dash />
                      )}
                    </td>
                    <td className="px-4 py-2">
                      <CustomerBadges customer={c} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile: cards */}
          <ul className="divide-y divide-gray-100 overflow-hidden rounded-lg border border-gray-200 bg-white md:hidden">
            {customers.map((c) => (
              <li key={c.id}>
                <Link
                  href={`/customers/${c.id}`}
                  className="flex items-start justify-between gap-3 px-4 py-3 hover:bg-gray-50"
                >
                  <div className="min-w-0 text-sm">
                    <p className="truncate font-medium">{c.name}</p>
                    <p className="truncate text-gray-500">{formatAddress(c) || "Geen adres"}</p>
                    {(c.email || c.phone) && (
                      <p className="truncate text-gray-500">
                        {[c.phone, c.email].filter(Boolean).join(" · ")}
                      </p>
                    )}
                  </div>
                  <CustomerBadges customer={c} />
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}

      {data && (
        <Pagination
          page={data.page}
          pageSize={data.pageSize}
          total={data.total}
          itemLabel="klanten"
          onPageChange={setPage}
          onPageSizeChange={(size) => {
            setPageSize(size);
            setPage(1);
          }}
        />
      )}

      <Modal title="Nieuwe klant" open={showNew} onClose={() => setShowNew(false)}>
        <CustomerForm
          onSubmit={(input) => createMutation.mutate(input)}
          busy={createMutation.isPending}
          error={createMutation.error ? (createMutation.error as Error).message : null}
        />
      </Modal>
    </div>
  );
}

function Dash() {
  return <span className="text-gray-300">—</span>;
}

/** Open-todo count and EF link status. */
function CustomerBadges({ customer: c }: { customer: CustomerDto }) {
  return (
    <div className="flex shrink-0 items-center justify-end gap-2 text-xs">
      {c.isDemo && (
        <span className="rounded-full bg-amber-100 px-2 py-0.5 font-medium text-amber-800" title="Demodata">
          Demo
        </span>
      )}
      {(c.openTodoCount ?? 0) > 0 && (
        <span className="whitespace-nowrap rounded-full bg-amber-100 px-2 py-0.5 font-medium text-amber-800">
          {c.openTodoCount} open
        </span>
      )}
      {c.efClientId ? (
        <span className="rounded-full bg-green-100 px-2 py-0.5 text-green-800" title="Gekoppeld aan EenvoudigFactureren">
          EF ✓
        </span>
      ) : (
        <span className="rounded-full bg-gray-100 px-2 py-0.5 text-gray-500" title="Nog niet gekoppeld aan EenvoudigFactureren">
          EF –
        </span>
      )}
    </div>
  );
}
