"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { EmptyState, ErrorNote, PageHeader, Spinner, StatusBadge } from "@/components/ui";
import { apiGet } from "@/lib/api-client";
import { type AppointmentDto, wazeUrl } from "@/lib/schemas/appointments";
import { formatTime } from "@/lib/time";

/**
 * Dagplanning voor op de werf: grote, duimvriendelijke kaarten met
 * Waze-navigatie en (vanaf Fase 4) de knop om het werk af te ronden.
 */
export default function VandaagPage() {
  const { data: appointments, isLoading, error } = useQuery({
    queryKey: ["appointments", "today"],
    queryFn: () => apiGet<AppointmentDto[]>("/api/appointments/today"),
    refetchInterval: 60_000,
  });

  const today = new Date().toLocaleDateString("nl-BE", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });

  return (
    <div className="mx-auto max-w-lg p-4 md:p-8">
      <PageHeader title="Vandaag" />
      <p className="-mt-3 mb-4 text-sm capitalize text-gray-500">{today}</p>

      {isLoading && <Spinner />}
      {error && <ErrorNote message={(error as Error).message} />}

      {appointments && appointments.length === 0 && (
        <EmptyState>
          Geen afspraken vandaag. 🌤 Plan werk in via de Planning-pagina.
        </EmptyState>
      )}

      <ul className="space-y-3">
        {appointments?.map((a) => (
          <li key={a.id} className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-lg font-bold text-brand-900">{formatTime(a.startAt)}</p>
                <p className="truncate font-medium">{a.customerName}</p>
                <p className="truncate text-sm text-gray-600">{a.todoTitle}</p>
                {a.address && <p className="mt-1 truncate text-sm text-gray-400">{a.address}</p>}
              </div>
              <StatusBadge status={a.status} />
            </div>

            <div className="mt-3 flex gap-2">
              {a.address ? (
                <a
                  href={wazeUrl(a.address)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-1 rounded-md bg-sky-500 py-2.5 text-center text-sm font-semibold text-white hover:bg-sky-600"
                >
                  🧭 Waze
                </a>
              ) : (
                <span className="flex-1 rounded-md bg-gray-100 py-2.5 text-center text-sm text-gray-400">
                  Geen adres bekend
                </span>
              )}
              {a.status === "PLANNED" && (
                <Link
                  href={`/vandaag/${a.id}/registreren`}
                  className="flex-1 rounded-md bg-brand-600 py-2.5 text-center text-sm font-semibold text-white hover:bg-brand-700"
                >
                  ✓ Klaar — uren ingeven
                </Link>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
