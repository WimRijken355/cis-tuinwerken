"use client";

import FullCalendar, {
  type EventClickInfo,
  type EventDropInfo,
  type EventResizeDoneInfo,
} from "@fullcalendar/react";
import interactionPlugin from "@fullcalendar/react/interaction";
import nlLocale from "@fullcalendar/react/locales/nl";
import classicTheme from "@fullcalendar/react/themes/classic";
import timeGridPlugin from "@fullcalendar/react/timegrid";
import "@fullcalendar/react/skeleton.css";
import "@fullcalendar/react/themes/classic/theme.css";
import "@fullcalendar/react/themes/classic/palette.css";
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
import type { AppointmentDto, AppointmentInput } from "@/lib/schemas/appointments";
import type { TodoDto } from "@/lib/schemas/todos";

/**
 * Weekplanning (desktop-first):
 * - links: todo's die ingepland moeten worden (terugkerend werk met voorkeursbadge)
 * - rechts: FullCalendar-weekraster; slepen = verplaatsen, rand slepen = duur wijzigen
 */
export default function PlanningPage() {
  const queryClient = useQueryClient();
  // Zichtbaar bereik van de kalender — bepaalt welke afspraken we ophalen.
  const [range, setRange] = useState<{ from: string; to: string } | null>(null);
  const [planTodo, setPlanTodo] = useState<TodoDto | null>(null);
  const [selected, setSelected] = useState<AppointmentDto | null>(null);

  const { data: todos, isLoading: todosLoading } = useQuery({
    queryKey: ["todos", "plannable"],
    queryFn: () => apiGet<TodoDto[]>("/api/todos?plannable=1"),
  });

  const { data: appointments } = useQuery({
    queryKey: ["appointments", range?.from, range?.to],
    queryFn: () =>
      apiGet<AppointmentDto[]>(`/api/appointments?from=${range!.from}&to=${range!.to}`),
    enabled: range !== null,
  });

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ["appointments"] });
    void queryClient.invalidateQueries({ queryKey: ["todos"] });
  };

  const moveMutation = useMutation({
    mutationFn: ({ id, startAt, durationMinutes }: { id: number; startAt: string; durationMinutes?: number }) =>
      apiSend(`/api/appointments/${id}`, "PATCH", { startAt, durationMinutes }),
    onSuccess: invalidate,
    onError: invalidate, // kalender terugzetten naar de servertoestand
  });

  function onEventDrop(arg: EventDropInfo) {
    moveMutation.mutate({ id: Number(arg.event.id), startAt: arg.event.start!.toISOString() });
  }

  function onEventResize(arg: EventResizeDoneInfo) {
    const minutes = Math.round((arg.event.end!.getTime() - arg.event.start!.getTime()) / 60000);
    moveMutation.mutate({
      id: Number(arg.event.id),
      startAt: arg.event.start!.toISOString(),
      durationMinutes: minutes,
    });
  }

  function onEventClick(arg: EventClickInfo) {
    const match = appointments?.find((a) => a.id === Number(arg.event.id));
    if (match) setSelected(match);
  }

  return (
    <div className="flex h-[calc(100dvh-5rem)] flex-col gap-4 p-4 md:h-dvh md:flex-row md:p-6">
      {/* Zijbalk: in te plannen */}
      <aside className="shrink-0 md:w-72">
        <h2 className="mb-2 font-semibold text-brand-900">In te plannen</h2>
        {todosLoading && <Spinner />}
        {todos && todos.length === 0 && (
          <EmptyState>
            Niets in te plannen. Maak een todo aan bij een klant.
          </EmptyState>
        )}
        <ul className="flex gap-2 overflow-x-auto md:flex-col md:overflow-visible">
          {todos?.map((t) => (
            <li key={t.id} className="shrink-0 md:shrink">
              <button
                type="button"
                onClick={() => setPlanTodo(t)}
                className="w-56 rounded-lg border border-gray-200 bg-white p-3 text-left shadow-sm hover:border-brand-500 md:w-full"
              >
                <p className="truncate text-sm font-medium">{t.title}</p>
                <p className="truncate text-xs text-gray-500">{t.customerName}</p>
                <p className="mt-1 text-xs text-gray-400">
                  ± {t.estimatedHours} u
                  {t.windowLabel && (
                    <span className="ml-2 rounded bg-brand-50 px-1.5 py-0.5 text-brand-700">
                      {t.windowLabel}
                    </span>
                  )}
                </p>
              </button>
            </li>
          ))}
        </ul>
      </aside>

      {/* Kalender */}
      <div className="min-h-0 flex-1 rounded-lg border border-gray-200 bg-white p-2 [&_.fc]:h-full">
        <FullCalendar
          plugins={[timeGridPlugin, interactionPlugin, classicTheme]}
          initialView="timeGridWeek"
          locale={nlLocale}
          height="100%"
          firstDay={1}
          slotMinTime="06:00:00"
          slotMaxTime="20:00:00"
          allDaySlot={false}
          nowIndicator
          editable
          eventDurationEditable
          headerToolbar={{ left: "prev,next today", center: "title", right: "" }}
          datesSet={(info) =>
            setRange({ from: info.start.toISOString(), to: info.end.toISOString() })
          }
          events={appointments?.map((a) => ({
            id: String(a.id),
            title: `${a.customerName} — ${a.todoTitle}`,
            start: a.startAt,
            end: new Date(new Date(a.startAt).getTime() + a.durationMinutes * 60000).toISOString(),
            backgroundColor: a.status === "DONE" ? "#9ca3af" : "#3d7a3d",
            borderColor: a.status === "DONE" ? "#9ca3af" : "#2f662f",
            editable: a.status !== "DONE",
          }))}
          eventDrop={onEventDrop}
          eventResize={onEventResize}
          eventClick={onEventClick}
        />
      </div>

      {planTodo && (
        <PlanDialog
          todo={planTodo}
          onClose={() => setPlanTodo(null)}
          onPlanned={() => {
            setPlanTodo(null);
            invalidate();
          }}
        />
      )}

      {selected && (
        <AppointmentDialog
          appointment={selected}
          onClose={() => setSelected(null)}
          onChanged={() => {
            setSelected(null);
            invalidate();
          }}
        />
      )}
    </div>
  );
}

/** Dialoog om een todo op datum + tijd te zetten (duur vooringevuld met de schatting). */
function PlanDialog({
  todo,
  onClose,
  onPlanned,
}: {
  todo: TodoDto;
  onClose: () => void;
  onPlanned: () => void;
}) {
  const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
  const [date, setDate] = useState(tomorrow);
  const [time, setTime] = useState("08:00");
  const [duration, setDuration] = useState(String(Math.round(todo.estimatedHours * 60)));

  const planMutation = useMutation({
    mutationFn: () => {
      const input: AppointmentInput = {
        todoId: todo.id,
        startAt: new Date(`${date}T${time}`).toISOString(),
        durationMinutes: Number(duration),
      };
      return apiSend("/api/appointments", "POST", input);
    },
    onSuccess: onPlanned,
  });

  return (
    <Modal title={`Inplannen: ${todo.title}`} open onClose={onClose}>
      <p className="mb-3 text-sm text-gray-500">
        {todo.customerName}
        {todo.windowLabel && ` · voorkeursperiode: ${todo.windowLabel}`}
      </p>
      {planMutation.error && <ErrorNote message={(planMutation.error as Error).message} />}
      <form
        className="mt-2 space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          planMutation.mutate();
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
        <Field label="Duur (minuten)" hint={`Schatting: ± ${todo.estimatedHours} uur`}>
          <TextInput
            type="number"
            min={15}
            step={15}
            value={duration}
            onChange={(e) => setDuration(e.target.value)}
            required
          />
        </Field>
        <div className="flex justify-end gap-2 pt-1">
          <Button variant="secondary" type="button" onClick={onClose}>
            Annuleren
          </Button>
          <Button type="submit" disabled={planMutation.isPending}>
            {planMutation.isPending ? "Bezig…" : "Inplannen"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

/** Dialoog bij klik op een bestaande afspraak: details + uit planning halen. */
function AppointmentDialog({
  appointment,
  onClose,
  onChanged,
}: {
  appointment: AppointmentDto;
  onClose: () => void;
  onChanged: () => void;
}) {
  const removeMutation = useMutation({
    mutationFn: () => apiSend(`/api/appointments/${appointment.id}`, "DELETE"),
    onSuccess: onChanged,
  });

  const reminderMutation = useMutation({
    mutationFn: () => apiSend(`/api/appointments/${appointment.id}/send-reminder`, "POST"),
    onSuccess: onChanged,
  });

  const start = new Date(appointment.startAt);

  return (
    <Modal title={appointment.todoTitle} open onClose={onClose}>
      <div className="space-y-2 text-sm">
        <p className="font-medium">{appointment.customerName}</p>
        <p className="text-gray-600">
          {start.toLocaleString("nl-BE", {
            weekday: "long",
            day: "numeric",
            month: "long",
            hour: "2-digit",
            minute: "2-digit",
          })}{" "}
          · {appointment.durationMinutes} min
        </p>
        {appointment.address && <p className="text-gray-500">{appointment.address}</p>}
        {appointment.reminderSentAt && (
          <p className="text-xs text-green-700">✓ Herinnering verstuurd</p>
        )}
        {appointment.reminderError && (
          <p className="text-xs text-red-600">⚠ Herinnering mislukt: {appointment.reminderError}</p>
        )}
        {appointment.status === "PLANNED" && (
          <button
            type="button"
            onClick={() => reminderMutation.mutate()}
            disabled={reminderMutation.isPending || !appointment.customerEmail}
            title={!appointment.customerEmail ? "Klant heeft geen e-mailadres" : undefined}
            className="text-xs text-brand-600 hover:underline disabled:text-gray-300"
          >
            {reminderMutation.isPending ? "Versturen…" : "✉ Herinnering nu versturen"}
          </button>
        )}
      </div>
      {(removeMutation.error || reminderMutation.error) && (
        <div className="mt-3">
          <ErrorNote
            message={((removeMutation.error ?? reminderMutation.error) as Error).message}
          />
        </div>
      )}
      <div className="mt-4 flex justify-between">
        <Button
          variant="danger"
          onClick={() => removeMutation.mutate()}
          disabled={removeMutation.isPending}
        >
          Uit planning halen
        </Button>
        <Button variant="secondary" onClick={onClose}>
          Sluiten
        </Button>
      </div>
    </Modal>
  );
}
