"use client";

import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { Button, ErrorNote, Field, Modal, TextInput } from "@/components/ui";
import { apiSend } from "@/lib/api-client";
import { arrivalDefaultTime, arrivalIso, isTime } from "@/lib/arrival";
import type { AppointmentDto } from "@/lib/schemas/appointments";

/**
 * Bottom sheet (phone) for "Aangekomen": record the actual start time on site.
 * The time is chosen by the user (default = now, or the time already entered)
 * and becomes the default "van" when registering (klaarmelden).
 */
export function ArrivalSheet({
  appointment,
  onClose,
  onChanged,
}: {
  appointment: AppointmentDto;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [time, setTime] = useState(() => arrivalDefaultTime(appointment.arrivedAt));

  const save = useMutation({
    mutationFn: (arrivedAt: string | null) => apiSend(`/api/appointments/${appointment.id}`, "PATCH", { arrivedAt }),
    onSuccess: onChanged,
  });

  return (
    <Modal title={`Aangekomen bij ${appointment.customerName}`} open onClose={onClose}>
      <p className="mb-3 text-sm text-gray-500">{appointment.todoTitle}</p>
      {save.error && <ErrorNote message={(save.error as Error).message} />}
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (isTime(time)) save.mutate(arrivalIso(appointment.startAt, time));
        }}
      >
        <Field label="Starttijd">
          <TextInput type="time" value={time} onChange={(e) => setTime(e.target.value)} required />
        </Field>
        <p className="text-xs text-gray-400">Deze tijd staat bij het klaarmelden al ingevuld als &quot;van&quot;.</p>
        <div className="flex justify-between gap-2 pt-1">
          {appointment.arrivedAt ? (
            <Button type="button" variant="secondary" onClick={() => save.mutate(null)} disabled={save.isPending}>
              Starttijd wissen
            </Button>
          ) : (
            <span />
          )}
          <Button type="submit" disabled={save.isPending || !isTime(time)}>
            {save.isPending ? "Bezig…" : "Opslaan"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
