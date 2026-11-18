"use client";

import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { Button, ErrorNote, Field, Modal, TextInput } from "@/components/ui";
import { apiSend } from "@/lib/api-client";
import type { AppointmentDto } from "@/lib/schemas/appointments";
import { toBrussels } from "@/lib/time";

/**
 * Bottom sheet (phone) to move an appointment to another day/time or take it
 * out of the planning — e.g. on site when the weather turns.
 * (Previously on the removed "Komende dagen" page.)
 */
export function RescheduleSheet({
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

  const error = moveMutation.error ?? removeMutation.error;
  return (
    <Modal
      title={`${appointment.isLoose ? appointment.todoTitle : appointment.customerName} verplaatsen`}
      open
      onClose={onClose}
    >
      <p className="mb-3 text-sm text-gray-500">{appointment.todoTitle}</p>
      {error && <ErrorNote message={(error as Error).message} />}
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
            <TextInput type="time" step={900} value={time} onChange={(e) => setTime(e.target.value)} required />
          </Field>
        </div>
        {!appointment.isLoose && (
          <p className="text-xs text-gray-400">
            Verplaats je naar een andere dag, dan krijgt de klant automatisch een nieuwe herinneringsmail (de avond
            ervoor).
          </p>
        )}
        <div className="flex justify-between gap-2 pt-1">
          <Button type="button" variant="danger" onClick={() => removeMutation.mutate()} disabled={removeMutation.isPending}>
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
