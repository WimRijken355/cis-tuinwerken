"use client";

import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { CustomerPicker, type PickedCustomer } from "@/components/customer-picker";
import { TodoForm, type TodoFormValues } from "@/components/todo-form";
import { ErrorNote, Field, FieldGroup, TextInput } from "@/components/ui";
import { apiGet } from "@/lib/api-client";
import type { LooseTodoPresetDto } from "@/lib/schemas/loose-todo-presets";
import type { TodoResourceDto, TodoTaskDto } from "@/lib/schemas/todos";

export interface TodoContactFields {
  contactName: string;
  contactStreet: string;
  contactPostalCode: string;
  contactCity: string;
}

export const EMPTY_CONTACT: TodoContactFields = {
  contactName: "",
  contactStreet: "",
  contactPostalCode: "",
  contactCity: "",
};

/** What the editor submits: the TodoForm values plus the owner. */
export type TodoEditorPayload = TodoFormValues & { customerId: number | null } & Partial<TodoContactFields>;

export interface TodoEditorInitial {
  kind: "customer" | "loose";
  customer: PickedCustomer | null;
  contact: TodoContactFields;
  title: string;
  estimatedHours: number;
  resources: TodoResourceDto[];
  tasks: TodoTaskDto[];
  isProject?: boolean;
}

/**
 * Full todo editor, used both for a new todo and to edit an existing one:
 * for a customer (picker) or a "losse todo" (free name/address + quick
 * picks), title, total time, checklist and resources.
 */
export function TodoEditor({
  initial,
  submitLabel,
  busy,
  error,
  onSubmit,
  onCancel,
  ownerLocked = false,
}: {
  initial: TodoEditorInitial;
  submitLabel: string;
  busy?: boolean;
  error?: string | null;
  onSubmit: (payload: TodoEditorPayload) => void;
  onCancel?: () => void;
  /** Work already registered: the customer can no longer change. */
  ownerLocked?: boolean;
}) {
  const [kind, setKind] = useState(initial.kind);
  const [customer, setCustomer] = useState<PickedCustomer | null>(initial.customer);
  const [contact, setContact] = useState<TodoContactFields>(initial.contact);
  const [localError, setLocalError] = useState<string | null>(null);
  const setContactField = (key: keyof TodoContactFields, value: string) =>
    setContact((c) => ({ ...c, [key]: value }));

  const { data: presets } = useQuery({
    queryKey: ["loose-todo-presets", "active"],
    queryFn: () => apiGet<LooseTodoPresetDto[]>("/api/loose-todo-presets"),
  });

  function submit(values: TodoFormValues) {
    if (kind === "customer" && !customer) {
      setLocalError("Kies eerst een klant (of maak er een losse todo van).");
      return;
    }
    setLocalError(null);
    onSubmit({
      ...values,
      customerId: kind === "customer" ? customer!.id : null,
      // Always send all four for a losse todo, so emptied fields are cleared too.
      ...(kind === "loose" ? contact : {}),
    });
  }

  return (
    <div>
      {ownerLocked ? (
        <p className="mb-3 rounded-md bg-gray-50 px-3 py-2 text-sm text-gray-600">
          {kind === "customer" ? `Klant: ${customer?.name ?? ""}` : "Losse todo"} — er is al werk geregistreerd, de
          klant kan niet meer wijzigen.
        </p>
      ) : (
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
      )}

      {!ownerLocked && kind === "customer" && (
        <div className="mb-3">
          <FieldGroup label="Klant">
            <CustomerPicker value={customer} onChange={setCustomer} />
          </FieldGroup>
        </div>
      )}
      {kind === "loose" && (
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
              <TextInput
                value={contact.contactStreet}
                onChange={(e) => setContactField("contactStreet", e.target.value)}
              />
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

      {localError && (
        <div className="mb-2">
          <ErrorNote message={localError} />
        </div>
      )}
      <TodoForm
        initial={{
          title: initial.title,
          estimatedHours: initial.estimatedHours,
          resources: initial.resources,
          tasks: initial.tasks,
          isProject: initial.isProject,
        }}
        submitLabel={submitLabel}
        busy={busy}
        error={error}
        onSubmit={submit}
        onCancel={onCancel}
        showChecklist={kind === "customer"}
        showProject={kind === "customer"}
        titleLabel={kind === "customer" ? "Wat moet er gebeuren?" : "Omschrijving"}
        titlePlaceholder={kind === "customer" ? "bv. Haag scheren" : "bv. Vakantie"}
        titleSuggestions={kind === "loose" ? (presets ?? []).map((p) => p.name) : []}
      />
    </div>
  );
}
