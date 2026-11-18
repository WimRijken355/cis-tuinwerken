"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import {
  Button,
  EmptyState,
  ErrorNote,
  PageHeader,
  Spinner,
  StatusBadge,
} from "@/components/ui";
import { apiGet, apiSend } from "@/lib/api-client";
import type { InvoiceDto } from "@/lib/schemas/completions";
import { canSendToEf } from "@/lib/services/invoice-sync";
import { formatDateShort } from "@/lib/time";

/**
 * Overzicht van de automatisch aangemaakte facturen + hun pushstatus naar
 * EenvoudigFactureren. Finaliseren/versturen gebeurt bewust in EF zelf.
 */
export default function InvoicesPage() {
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<string>("");

  const { data: invoices, isLoading, error } = useQuery({
    queryKey: ["invoices", filter],
    queryFn: () => apiGet<InvoiceDto[]>(`/api/invoices${filter ? `?status=${filter}` : ""}`),
  });

  const { data: settings } = useQuery({
    queryKey: ["settings"],
    queryFn: () => apiGet<{ efInvoiceSyncEnabled: boolean }>("/api/settings"),
  });
  const syncEnabled = settings?.efInvoiceSyncEnabled ?? true;

  const retryMutation = useMutation({
    mutationFn: (id: number) => apiSend(`/api/invoices/${id}/retry-push`, "POST"),
    onSettled: () => void queryClient.invalidateQueries({ queryKey: ["invoices"] }),
  });

  return (
    <div className="p-4 md:p-8">
      <PageHeader
        title="Facturen"
        actions={
          <a
            href="https://eenvoudigfactureren.be"
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Open EenvoudigFactureren ↗
          </a>
        }
      />

      {settings && !syncEnabled && (
        <p className="mb-4 rounded-md bg-gray-100 px-3 py-2 text-sm text-gray-700">
          Synchronisatie naar EenvoudigFactureren staat uit. Nieuwe facturen blijven
          enkel in deze app. Aanzetten kan via Instellingen → Algemeen.
        </p>
      )}

      <div className="mb-4 flex flex-wrap gap-2 text-sm">
        {[
          ["", "Alle"],
          ["CONCEPT_CREATED", "In EF"],
          ["FAILED", "Push mislukt"],
          ["NOT_SYNCED", "Niet gesynchroniseerd"],
        ].map(([value, label]) => (
          <button
            key={value}
            type="button"
            onClick={() => setFilter(value)}
            className={`rounded-full px-3 py-1 ${
              filter === value ? "bg-brand-600 text-white" : "bg-white text-gray-600 border border-gray-200"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {isLoading && <Spinner />}
      {error && <ErrorNote message={(error as Error).message} />}
      {retryMutation.error && (
        <div className="mb-3">
          <ErrorNote message={(retryMutation.error as Error).message} />
        </div>
      )}

      {invoices && invoices.length === 0 && (
        <EmptyState>
          Nog geen facturen. Rond een werk af via &quot;Vandaag&quot; en de factuur
          verschijnt hier automatisch.
        </EmptyState>
      )}

      {invoices && invoices.length > 0 && (
        <ul className="divide-y divide-gray-100 overflow-hidden rounded-lg border border-gray-200 bg-white">
          {invoices.map((inv) => (
            <li key={inv.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
              <div className="min-w-0">
                <p className="truncate font-medium">{inv.customerName}</p>
                <p className="truncate text-sm text-gray-500">
                  {inv.workTitle} · {formatDateShort(inv.workDate)}
                </p>
                {inv.errorMessage && (
                  <p className="mt-1 max-w-xl truncate text-xs text-red-600" title={inv.errorMessage}>
                    {inv.errorMessage}
                  </p>
                )}
              </div>
              <div className="flex shrink-0 items-center gap-3">
                <span className="font-medium">€ {inv.totalExclVat.toFixed(2)}</span>
                <StatusBadge status={inv.pushStatus} />
                {canSendToEf({ efInvoiceId: inv.efInvoiceId ?? null, pushStatus: inv.pushStatus }, syncEnabled, inv.customerIsDemo)
                  .allowed && (
                  <Button
                    variant="secondary"
                    onClick={() => retryMutation.mutate(inv.id)}
                    disabled={retryMutation.isPending}
                  >
                    {inv.pushStatus === "FAILED" ? "↻ Opnieuw" : "→ Naar EF sturen"}
                  </Button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      <p className="mt-3 text-xs text-gray-400">
        Bedragen zijn excl. btw. Concepten kijk je na en finaliseer je in
        EenvoudigFactureren zelf.
      </p>
    </div>
  );
}
