"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { CustomerPicker, type PickedCustomer } from "@/components/customer-picker";
import { TodoForm, type TodoFormValues } from "@/components/todo-form";
import { Button, ErrorNote, Field, Modal, TextInput, Toggle } from "@/components/ui";
import { apiGet, apiSend } from "@/lib/api-client";
import { formatMinutesAsHours, partLabel, WORKDAY_MINUTES } from "@/lib/planning";
import type { AppointmentDto, AppointmentInput } from "@/lib/schemas/appointments";
import type { LooseTodoPresetDto } from "@/lib/schemas/loose-todo-presets";
import type { TodoDto } from "@/lib/schemas/todos";
import { ResourceChips } from "./planning-cards";

/** Click on a block: details, the bevestigd/reservatie switches, reminder, remove. */
export function AppointmentDialog({
  appointment: a,
  onClose,
  onChanged,
}: {
  appointment: AppointmentDto;
  onClose: () => void;
  onChanged: () => void;
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
            Uit planning halen
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
  const [duration, setDuration] = useState(String(Math.min(remaining, WORKDAY_MINUTES)));

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
            <TextInput type="time" value={time} onChange={(e) => setTime(e.target.value)} required />
          </Field>
        </div>
        <Field label="Duur (minuten)" hint="Max. één werkdag per blok; de rest blijft in te plannen.">
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

/**
 * New todo from a block selected in the grid (point 7): for a customer (with
 * checklist + resources, like on the customer card) or a "losse todo"
 * (holiday, doctor, ...). Creates the todo and plans the selected block.
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
  const [kind, setKind] = useState<"customer" | "loose">("customer");
  const [customer, setCustomer] = useState<PickedCustomer | null>(null);
  // Free-text name/address for a losse todo (not added to the customer list).
  const [contact, setContact] = useState({ contactName: "", contactStreet: "", contactPostalCode: "", contactCity: "" });
  const setContactField = (key: keyof typeof contact, value: string) => setContact((c) => ({ ...c, [key]: value }));
  const { data: presets } = useQuery({
    queryKey: ["loose-todo-presets", "active"],
    queryFn: () => apiGet<LooseTodoPresetDto[]>("/api/loose-todo-presets"),
  });
  const durationMinutes = Math.round((end.getTime() - start.getTime()) / 60000);

  const createMutation = useMutation({
    mutationFn: async (values: TodoFormValues) => {
      if (kind === "customer" && !customer) throw new Error("Kies eerst een klant (of maak er een losse todo van).");
      const todo = await apiSend<TodoDto>("/api/todos", "POST", {
        ...values,
        customerId: kind === "customer" ? customer!.id : null,
        ...(kind === "loose" ? contact : {}),
      });
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
      <div className="mb-3 flex gap-2">
        {(
          [
            ["customer", "👤 Voor een klant"],
            ["loose", "📌 Losse todo"],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            onClick={() => setKind(value)}
            className={`flex-1 rounded-md border px-3 py-2 text-sm ${
              kind === value
                ? "border-brand-600 bg-brand-50 font-medium text-brand-700"
                : "border-gray-300 bg-white text-gray-600 hover:bg-gray-50"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {kind === "customer" ? (
        <div className="mb-3">
          <Field label="Klant">
            <CustomerPicker value={customer} onChange={setCustomer} />
          </Field>
        </div>
      ) : (
        <div className="mb-3 space-y-2">
          <p className="text-xs text-gray-500">
            Een losse todo hoort niet bij een klant uit je klantenbestand (bv. vakantie, doktersafspraak, een
            eenmalige klus). Naam en adres zijn optioneel. Losse todo&apos;s worden nooit geregistreerd of
            gefactureerd.
          </p>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Naam (optioneel)">
              <TextInput value={contact.contactName} onChange={(e) => setContactField("contactName", e.target.value)} />
            </Field>
            <Field label="Straat + nr (optioneel)">
              <TextInput value={contact.contactStreet} onChange={(e) => setContactField("contactStreet", e.target.value)} />
            </Field>
            <Field label="Postcode">
              <TextInput
                inputMode="numeric"
                value={contact.contactPostalCode}
                onChange={(e) => setContactField("contactPostalCode", e.target.value)}
              />
            </Field>
            <Field label="Plaats">
              <TextInput value={contact.contactCity} onChange={(e) => setContactField("contactCity", e.target.value)} />
            </Field>
          </div>
        </div>
      )}

      <TodoForm
        key={kind}
        initial={{ title: "", estimatedHours: durationMinutes / 60, resources: [], tasks: [] }}
        submitLabel="Aanmaken en inplannen"
        busy={createMutation.isPending}
        error={createMutation.error ? (createMutation.error as Error).message : null}
        onSubmit={(values) => createMutation.mutate(values)}
        onCancel={onClose}
        showChecklist={kind === "customer"}
        titleLabel={kind === "customer" ? "Wat moet er gebeuren?" : "Omschrijving"}
        titlePlaceholder={kind === "customer" ? "bv. Haag scheren" : "bv. Vakantie"}
        titleSuggestions={kind === "loose" ? (presets ?? []).map((p) => p.name) : []}
      />
      {kind === "customer" && (
        <p className="mt-2 text-xs text-gray-400">
          Is de totale tijd groter dan het geselecteerde blok, dan blijft de rest in &quot;In te plannen&quot; staan.
        </p>
      )}
    </Modal>
  );
}
