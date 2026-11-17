"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";
import { CustomerForm } from "@/components/customer-form";
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
import { formatAddress, type CustomerDto, type CustomerInput } from "@/lib/schemas/customers";

export default function CustomersPage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [showNew, setShowNew] = useState(false);

  const { data: customers, isLoading, error } = useQuery({
    queryKey: ["customers", search],
    queryFn: () =>
      apiGet<CustomerDto[]>(`/api/customers?search=${encodeURIComponent(search)}`),
  });

  const createMutation = useMutation({
    mutationFn: (input: CustomerInput) => apiSend<CustomerDto>("/api/customers", "POST", input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["customers"] });
      setShowNew(false);
    },
  });

  return (
    <div className="p-4 md:p-8">
      <PageHeader
        title="Klanten"
        actions={<Button onClick={() => setShowNew(true)}>+ Nieuwe klant</Button>}
      />

      <TextInput
        placeholder="Zoeken op naam, gemeente of straat…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="mb-4 max-w-md"
      />

      {isLoading && <Spinner />}
      {error && <ErrorNote message={(error as Error).message} />}

      {customers && customers.length === 0 && (
        <EmptyState>
          {search
            ? "Geen klanten gevonden voor deze zoekopdracht."
            : "Nog geen klanten. Maak je eerste klant aan, of importeer je bestaande klanten uit EenvoudigFactureren via Instellingen."}
        </EmptyState>
      )}

      {customers && customers.length > 0 && (
        <ul className="divide-y divide-gray-100 overflow-hidden rounded-lg border border-gray-200 bg-white">
          {customers.map((c) => (
            <li key={c.id}>
              <Link
                href={`/customers/${c.id}`}
                className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-gray-50"
              >
                <div className="min-w-0">
                  <p className="truncate font-medium">{c.name}</p>
                  <p className="truncate text-sm text-gray-500">
                    {formatAddress(c) || "Geen adres"}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2 text-xs">
                  {(c.openTodoCount ?? 0) > 0 && (
                    <span className="rounded-full bg-amber-100 px-2 py-0.5 font-medium text-amber-800">
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
              </Link>
            </li>
          ))}
        </ul>
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
