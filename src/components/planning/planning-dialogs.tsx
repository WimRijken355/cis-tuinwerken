"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { DurationInput } from "@/components/duration-input";
import { EMPTY_CONTACT, TodoEditor, type TodoEditorPayload } from "@/components/todo-editor";
import { ACTION_ICONS } from "@/components/action-icons";
import { Button, ErrorNote, Field, Modal, TextInput, Toggle } from "@/components/ui";
import { apiGet, apiSend } from "@/lib/api-client";
import { formatMinutesAsHours, partLabel, roundToQuarter, splitOverWorkdays } from "@/lib/planning";
import { useWorkdayMinutes } from "@/lib/use-workday";
import type { AppointmentDto, AppointmentInput } from "@/lib/schemas/appointments";
import type { TodoDto, TodoRegistrationDto } from "@/lib/schemas/todos";
import { TodoStatusPicker } from "@/components/todo-status-picker";
import { ResourceChips } from "./planning-cards";

/** Click on a block: details, the bevestigd/reservatie switches, reminder, remove. */
export function AppointmentDialog({
  appointment: a,
  onClose,
  onChanged,
  onEditTodo,
}: {
  appointment: AppointmentDto;
  onClose: () => void;
  onChanged: () => void;
  /** Opens the full todo editor (owner, title, time, checklist, resources). */
  onEditTodo?: () => void;
}) {
  // Local copy so the switches react immediately; the server enforces exclusivity too.
  const [flags, setFlags] = useState({ confirmed: a.confirmed, reservation: a.reservation });

  const flagMutation = useMutation({
    mutationFn: (input: { confirmed?: boolean; reservation?: boolean }) =>
      apiSend<AppointmentDto>(`/api/appointments/${a.id}`, "PATCH", input),
    onSuccess: (updated) => {
      setFlags({ confirmed: updated.confirmed, reservation: updated.reservation });
      onChanged();
    },
  });
  const removeMutation = useMutation({
    mutationFn: () => apiSend(`/api/appointments/${a.id}`, "DELETE"),
    onSuccess: () => {
      onChanged();
      onClose();
    },
  });
  const reminderMutation = useMutation({
    mutationFn: () => apiSend(`/api/appointments/${a.id}/send-reminder`, "POST"),
    onSuccess: onChanged,
  });

  const start = new Date(a.startAt);
  const end = new Date(start.getTime() + a.durationMinutes * 60000);
  const part = partLabel(a.part);
  const editable = a.status === "PLANNED";
  const error = flagMutation.error ?? removeMutation.error ?? reminderMutation.error;

  return (
    <Modal title={a.isLoose ? a.todoTitle : a.customerName} open onClose={onClose}>
      <div className="space-y-2 text-sm">
        {!a.isLoose && <p className="font-medium">{a.todoTitle}</p>}
        <p className="text-gray-600">
          {start.toLocaleString("nl-BE", { weekday: "long", day: "numeric", month: "long" })} ·{" "}
          {start.toLocaleTimeString("nl-BE", { hour: "2-digit", minute: "2-digit" })}–
          {end.toLocaleTimeString("nl-BE", { hour: "2-digit", minute: "2-digit" })} (
          {formatMinutesAsHours(a.durationMinutes)})
        </p>
        <p className="text-gray-500">
          {part ? `Deel ${part} · ` : ""}
          todo totaal {formatMinutesAsHours(Math.round(a.estimatedHours * 60))}
          {a.todoRemainingMinutes > 0 && ` · nog ${formatMinutesAsHours(a.todoRemainingMinutes)} in te plannen`}
        </p>
        {a.address && <p className="text-gray-500">{a.address}</p>}
        <ResourceChips resources={a.resources} showHours />
        {onEditTodo && (
          <button
            type="button"
            onClick={onEditTodo}
            className="mt-1 rounded border border-gray-300 px-2 py-1 text-xs text-gray-700 hover:bg-gray-50"
          >
            {ACTION_ICONS.edit} Todo bewerken (klant, checklist, resources…)
          </button>
        )}
      </div>

      {editable && (
        <div className="mt-4 space-y-2 rounded-lg border border-gray-200 p-3">
          <label className="flex items-center justify-between gap-3">
            <span>
              <span className="text-sm font-medium">✓ Bevestigd</span>
              <span className="block text-xs text-gray-500">De afspraak is bevestigd aan de klant.</span>
            </span>
            <Toggle
              checked={flags.confirmed}
              label="Bevestigd"
              disabled={flagMutation.isPending}
              onChange={(confirmed) => flagMutation.mutate({ confirmed })}
            />
          </label>
          <label className="flex items-center justify-between gap-3">
            <span>
              <span className="text-sm font-medium">⏳ Reservatie</span>
              <span className="block text-xs text-gray-500">Voorlopig ingepland, kan nog wijzigen.</span>
            </span>
            <Toggle
              checked={flags.reservation}
              label="Reservatie"
              disabled={flagMutation.isPending}
              onChange={(reservation) => flagMutation.mutate({ reservation })}
            />
          </label>
          <p className="text-[11px] text-gray-400">Bevestigd en reservatie sluiten elkaar uit.</p>
        </div>
      )}

      {editable && !a.isLoose && (
        <div className="mt-3 text-xs">
          {a.reminderSentAt && <p className="text-green-700">✓ Herinnering verstuurd</p>}
          {a.reminderError && <p className="text-red-600">⚠ Herinnering mislukt: {a.reminderError}</p>}
          <button
            type="button"
            onClick={() => reminderMutation.mutate()}
            disabled={reminderMutation.isPending || !a.customerEmail || a.isDemo}
            title={a.isDemo ? "Demoklant: geen mails" : !a.customerEmail ? "Klant heeft geen e-mailadres" : undefined}
            className="text-brand-600 hover:underline disabled:text-gray-300"
          >
            {reminderMutation.isPending ? "Versturen…" : "✉ Herinnering nu versturen"}
          </button>
        </div>
      )}

      {error && (
        <div className="mt-3">
          <ErrorNote message={(error as Error).message} />
        </div>
      )}
      <div className="mt-4 flex justify-between">
        {editable ? (
          <Button variant="danger" onClick={() => removeMutation.mutate()} disabled={removeMutation.isPending}>
            {ACTION_ICONS.delete} Uit planning halen
          </Button>
        ) : (
          <span />
        )}
        <Button variant="secondary" onClick={onClose}>
          Sluiten
        </Button>
      </div>
    </Modal>
  );
}

/** Fallback for touch/mobile: click a sidebar todo and pick date + time. */
export function PlanDialog({
  todo,
  onClose,
  onPlanned,
}: {
  todo: TodoDto;
  onClose: () => void;
  onPlanned: () => void;
}) {
  const remaining = todo.remainingMinutes ?? Math.round(todo.estimatedHours * 60);
  const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
  const [date, setDate] = useState(tomorrow);
  const [time, setTime] = useState("08:00");
  // Whole quarters only (the smallest planning unit), shown in hours.
  const workdayMinutes = useWorkdayMinutes();
  const [duration, setDuration] = useState(roundToQuarter(Math.min(remaining, workdayMinutes)));

  // More than a working day is spread over consecutive weekdays (max. one block each, see Settings).
  const blocks = splitOverWorkdays(date, time || "08:00", duration, workdayMinutes);

  const planMutation = useMutation({
    mutationFn: async () => {
      for (const block of blocks) {
        const input: AppointmentInput = { todoId: todo.id, ...block };
        await apiSend("/api/appointments", "POST", input);
      }
    },
    onSuccess: onPlanned,
  });

  return (
    <Modal title={`Inplannen: ${todo.title}`} open onClose={onClose}>
      <p className="mb-3 text-sm text-gray-500">
        {todo.customerId === null ? "Losse todo" : todo.customerName} · nog {formatMinutesAsHours(remaining)} in te
        plannen
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
            <TextInput type="time" step={900} value={time} onChange={(e) => setTime(e.target.value)} required />
          </Field>
        </div>
        <Field label="Duur">
          <DurationInput value={duration} onChange={setDuration} />
        </Field>
        {blocks.length > 1 ? (
          <p className="rounded-md bg-brand-50 px-3 py-2 text-xs text-brand-900">
            Meer dan één werkdag: wordt verdeeld over {blocks.length} werkdagen (max. {formatMinutesAsHours(workdayMinutes)} per dag, zelfde startuur,
            weekend overgeslagen):{" "}
            {blocks
              .map(
                (b) =>
                  `${new Date(b.startAt).toLocaleDateString("nl-BE", { weekday: "short", day: "numeric", month: "short" })} ${formatMinutesAsHours(b.durationMinutes)}`,
              )
              .join(" · ")}
          </p>
        ) : (
          <p className="text-xs text-gray-400">
            {duration < remaining
              ? `Daarna blijft er nog ${formatMinutesAsHours(remaining - duration)} in te plannen.`
              : "Hiermee is de todo volledig ingepland."}
          </p>
        )}
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

/**
 * New todo from a block selected in the grid (point 7): for a customer (with
 * checklist + resources) or a "losse todo"; creates the todo and plans the
 * selected block.
 */
export function NewTodoDialog({
  start,
  end,
  onClose,
  onCreated,
}: {
  start: Date;
  end: Date;
  onClose: () => void;
  onCreated: () => void;
}) {
  const durationMinutes = Math.round((end.getTime() - start.getTime()) / 60000);

  const createMutation = useMutation({
    mutationFn: async (payload: TodoEditorPayload) => {
      const todo = await apiSend<TodoDto>("/api/todos", "POST", payload);
      await apiSend("/api/appointments", "POST", {
        todoId: todo.id,
        startAt: start.toISOString(),
        durationMinutes,
      } satisfies AppointmentInput);
    },
    onSuccess: onCreated,
  });

  const when = `${start.toLocaleString("nl-BE", { weekday: "short", day: "numeric", month: "short" })} ${start.toLocaleTimeString("nl-BE", { hour: "2-digit", minute: "2-digit" })}–${end.toLocaleTimeString("nl-BE", { hour: "2-digit", minute: "2-digit" })}`;

  return (
    <Modal title="Nieuwe todo inplannen" open onClose={onClose}>
      <p className="mb-3 text-sm text-gray-500">
        {when} ({formatMinutesAsHours(durationMinutes)})
      </p>
      <TodoEditor
        initial={{
          kind: "customer",
          customer: null,
          contact: EMPTY_CONTACT,
          title: "",
          estimatedHours: durationMinutes / 60,
          resources: [],
          tasks: [],
        }}
        submitLabel="Aanmaken en inplannen"
        busy={createMutation.isPending}
        error={createMutation.error ? (createMutation.error as Error).message : null}
        onSubmit={(payload) => createMutation.mutate(payload)}
        onCancel={onClose}
      />
      <p className="mt-2 text-xs text-gray-400">
        Is de totale tijd groter dan het geselecteerde blok, dan blijft de rest in &quot;In te plannen&quot; staan.
      </p>
    </Modal>
  );
}

/**
 * New todo without planning it right away (Todo's overview): for a customer
 * (with checklist + resources) or a "losse todo". It lands in "In te plannen".
 */
export function CreateTodoDialog({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const createMutation = useMutation({
    mutationFn: (payload: TodoEditorPayload) => apiSend<TodoDto>("/api/todos", "POST", payload),
    onSuccess: onCreated,
  });

  return (
    <Modal title="Nieuwe todo" open onClose={onClose}>
      <TodoEditor
        initial={{
          kind: "customer",
          customer: null,
          contact: EMPTY_CONTACT,
          title: "",
          estimatedHours: 1,
          resources: [],
          tasks: [],
        }}
        submitLabel="Aanmaken"
        busy={createMutation.isPending}
        error={createMutation.error ? (createMutation.error as Error).message : null}
        onSubmit={(payload) => createMutation.mutate(payload)}
        onCancel={onClose}
      />
      <p className="mt-2 text-xs text-gray-400">
        De todo komt in &quot;In te plannen&quot;; inplannen doe je daarna in de Planning.
      </p>
    </Modal>
  );
}

export interface TodoDetail extends TodoDto {
  customerAddress: string;
  appointments: { id: number; status: "PLANNED" | "DONE" | "CANCELLED"; startAt: string; durationMinutes: number }[];
  /** Registered days (hours per resource, articles, invoice), oldest first. */
  registrations: TodoRegistrationDto[];
  /** Demo customer: never sent to EenvoudigFactureren. */
  customerIsDemo: boolean;
}

/**
 * Edit an existing todo completely, like a new one: owner (customer or losse
 * todo with name/address), title, total time, checklist and resources.
 * Opened from a sidebar card or from the details of a block in the grid, and
 * from the Todo's overview (which adds its blocks + status actions via `extra`).
 * The status can be set by hand at the top (TodoStatusPicker, applied at once).
 */
export function TodoEditDialog({
  todoId,
  onClose,
  onSaved,
  extra,
}: {
  todoId: number;
  onClose: () => void;
  onSaved: () => void;
  /** Extra content below the editor, rendered once the todo is loaded. */
  extra?: (todo: TodoDetail) => React.ReactNode;
}) {
  const { data: todo, isLoading, error: loadError } = useQuery({
    queryKey: ["todo", todoId],
    queryFn: () => apiGet<TodoDetail>(`/api/todos/${todoId}`),
  });

  const saveMutation = useMutation({
    mutationFn: (payload: TodoEditorPayload) => apiSend(`/api/todos/${todoId}`, "PATCH", payload),
    onSuccess: onSaved,
  });

  const registered = (todo?.appointments ?? []).some((a) => a.status === "DONE");

  return (
    <Modal title="Todo bewerken" open onClose={onClose}>
      {isLoading && <p className="text-sm text-gray-500">Laden…</p>}
      {loadError && <ErrorNote message={(loadError as Error).message} />}
      {todo && <TodoStatusPicker todo={todo} />}
      {todo && (
        <TodoEditor
          initial={{
            kind: todo.customerId === null ? "loose" : "customer",
            customer:
              todo.customerId === null
                ? null
                : { id: todo.customerId, name: todo.customerName ?? "", address: todo.customerAddress },
            contact: {
              contactName: todo.contactName ?? "",
              contactStreet: todo.contactStreet ?? "",
              contactPostalCode: todo.contactPostalCode ?? "",
              contactCity: todo.contactCity ?? "",
            },
            title: todo.title,
            estimatedHours: todo.estimatedHours,
            resources: todo.resources ?? [],
            tasks: todo.tasks ?? [],
            isProject: todo.isProject,
            description: todo.description,
            invoiceDescription: todo.invoiceDescription,
            quoteLineIds: (todo.quoteLines ?? []).map((l) => l.quoteLineId),
          }}
          todoId={todo.id}
          ownerLocked={registered}
          submitLabel="Bewaren"
          busy={saveMutation.isPending}
          error={saveMutation.error ? (saveMutation.error as Error).message : null}
          onSubmit={(payload) => saveMutation.mutate(payload)}
          onCancel={onClose}
        />
      )}
      {todo && (
        <p className="mt-2 text-xs text-gray-400">
          Pas je de totale tijd aan, dan verandert ook wat er nog in te plannen blijft. Geplande blokken blijven staan.
        </p>
      )}
      {todo && extra?.(todo)}
    </Modal>
  );
}
