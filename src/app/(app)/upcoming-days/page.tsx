"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import {
  Button,
  EmptyState,
  ErrorNote,
  Field,
  Modal,
  Spinner,
  TextInput,
} from "@/components/ui";
import { apiGet, apiSend } from "@/lib/api-client";
import type { AppointmentDto } from "@/lib/schemas/appointments";
import { formatTime, toBrussels } from "@/lib/time";

const DAYS_AHEAD = 14;

/**
 * Komende 14 dagen, gegroepeerd per dag. Tik op een afspraak om ze te
 * verplaatsen (datum/tijd) — handig 's avonds of bij slecht weer.
 */
export default function UpcomingDaysPage() {
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState<AppointmentDto | null>(null);

  const from = new Date();
  from.setHours(0, 0, 0, 0);
  const to = new Date(from.getTime() + DAYS_AHEAD * 86400000);

  const { data: appointments, isLoading, error } = useQuery({
    queryKey: ["appointments", "upcoming"],
    queryFn: () =>
      apiGet<AppointmentDto[]>(
        `/api/appointments?from=${from.toISOString()}&to=${to.toISOString()}`,
      ),
  });

  // Groeperen per Brusselse dag.
  const groups = new Map<string, AppointmentDto[]>();
  for (const a of appointments ?? []) {
    const key = toBrussels(a.startAt).toFormat("yyyy-MM-dd");
    groups.set(key, [...(groups.get(key) ?? []), a]);
  }

  return (
    <div className="mx-auto max-w-lg p-4 md:p-8">
      <h1 className="mb-4 text-2xl font-bold text-brand-900">Komende dagen</h1>

      {isLoading && <Spinner />}
      {error && <ErrorNote message={(error as Error).message} />}
      {appointments && appointments.length === 0 && (
        <EmptyState>Geen afspraken in de komende {DAYS_AHEAD} dagen.</EmptyState>
      )}

      <div className="space-y-5">
        {[...groups.entries()].map(([day, items]) => (
          <section key={day}>
            <h2 className="mb-2 text-sm font-semibold capitalize text-gray-500">
              {toBrussels(items[0].startAt).setLocale("nl").toFormat("cccc d LLLL")}
            </h2>
            <ul className="space-y-2">
              {items.map((a) => (
                <li key={a.id}>
                  <button
                    type="button"
                    onClick={() => a.status === "PLANNED" && setSelected(a)}
                    className="flex w-full items-center justify-between gap-3 rounded-lg border border-gray-200 bg-white p-3 text-left hover:border-brand-500 disabled:opacity-60"
                    disabled={a.status !== "PLANNED"}
                  >
                    <div className="min-w-0">
                      <p className="truncate font-medium">
                        {formatTime(a.startAt)} · {a.customerName}
                      </p>
                      <p className="truncate text-sm text-gray-500">{a.todoTitle}</p>
                    </div>
                    {a.status === "PLANNED" && <span className="text-gray-300">›</span>}
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>

      {selected && (
        <RescheduleSheet
          appointment={selected}
          onClose={() => setSelected(null)}
          onChanged={() => {
            setSelected(null);
            void queryClient.invalidateQueries({ queryKey: ["appointments"] });
          }}
        />
      )}
    </div>
  );
}

/** Bottom sheet om een afspraak te verplaatsen. */
function RescheduleSheet({
  appointment,
  onClose,
  onChanged,
}: {
  appointment: AppointmentDto;
  onClose: () => void;
  onChanged: () => void;
}) {
  const current = toBrussels(appointment.startAt);
  const [date, setDate] = useState(current.toFormat("yyyy-MM-dd"));
  const [time, setTime] = useState(current.toFormat("HH:mm"));

  const moveMutation = useMutation({
    mutationFn: () =>
      apiSend(`/api/appointments/${appointment.id}`, "PATCH", {
        startAt: new Date(`${date}T${time}`).toISOString(),
      }),
    onSuccess: onChanged,
  });

  const removeMutation = useMutation({
    mutationFn: () => apiSend(`/api/appointments/${appointment.id}`, "DELETE"),
    onSuccess: onChanged,
  });

  return (
    <Modal title={`${appointment.customerName} verplaatsen`} open onClose={onClose}>
      <p className="mb-3 text-sm text-gray-500">{appointment.todoTitle}</p>
      {moveMutation.error && <ErrorNote message={(moveMutation.error as Error).message} />}
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          moveMutation.mutate();
        }}
      >
        <div className="grid grid-cols-2 gap-3">
          <Field label="Datum">
            <TextInput type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
          </Field>
          <Field label="Startuur">
            <TextInput type="time" value={time} onChange={(e) => setTime(e.target.value)} required />
          </Field>
        </div>
        <p className="text-xs text-gray-400">
          Verplaats je naar een andere dag, dan krijgt de klant automatisch een
          nieuwe herinneringsmail (de avond ervoor).
        </p>
        <div className="flex justify-between gap-2 pt-1">
          <Button
            type="button"
            variant="danger"
            onClick={() => removeMutation.mutate()}
            disabled={removeMutation.isPending}
          >
            Uit planning
          </Button>
          <Button type="submit" disabled={moveMutation.isPending}>
            {moveMutation.isPending ? "Bezig…" : "Verplaatsen"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
